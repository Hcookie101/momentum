// Proxies the chat to whichever provider the user configured in the AI settings
// dialog (app/ui/ai-settings.tsx): it runs the streaming tool loop — the model
// can call the tools in app/lib/ai-tools.ts to read the user's live Momentum
// data — and re-streams the answer as line-delimited SSE: `data: {"text":"…"}`
// chunks followed by `data: [DONE]`. Failures after the stream has started
// arrive as `data: {"error":"…"}`.
//
// The provider settings — including the API key — arrive per request from the
// browser, so nothing is persisted here and there is no CORS to worry about.
// Tool queries run with the request's cookie-backed Supabase client (see
// createSession below).

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/supabase/server";
import type { ChatDay } from "@/app/lib/ai";
import { AI_TOOLS, executeAiTool, type AiToolCall } from "@/app/lib/ai-tools";
import {
  createStreamParser,
  type ProviderConfig,
  type ToolRound,
  upstreamRequest,
} from "@/app/lib/ai-providers";
import { dayRange, toLocalDateString } from "@/app/lib/stats";

export const SYSTEM_PROMPT =
  "You are the assistant built into Momentum, a personal focus and " +
  "productivity dashboard with goals, obligations, a weekly schedule and " +
  "focus statistics. You have tools that read the user's live dashboard " +
  "data — call them whenever a question is about the user's own time, " +
  "focus, browsing, goals or schedule instead of guessing. Dates and times " +
  "in tool results are the user's local time. Answer briefly and practically.";

// One reply may chain at most this many tool rounds before we give up.
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = { role: "user" | "assistant"; content: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function readConfig(request: Request): ProviderConfig | string {
  const header = (request.headers.get("x-ai-provider") ?? "").toLowerCase();
  const provider: ProviderConfig["provider"] =
    header === "anthropic" || header === "gemini" ? header : "openai";
  const apiKey = (request.headers.get("x-ai-key") ?? "").trim();
  const baseUrl = (request.headers.get("x-ai-base-url") ?? "").trim();
  const model = (request.headers.get("x-ai-model") ?? "").trim();

  if (!apiKey) return "Add your API key in the AI settings panel first.";
  if (!model) return "Pick a model in the AI settings panel first.";
  if (!/^https?:\/\/.+/i.test(baseUrl)) return "The base URL must start with http:// or https://.";

  return { provider, apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model };
}

// Pull the human-readable part out of a provider error body.
function providerError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    const message =
      typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (message) return message;
  } catch {
    // not JSON — fall through to the raw text below
  }
  const trimmed = body.trim().slice(0, 300);
  return trimmed || `The provider replied with ${status}.`;
}

// The browser computes the day window (local midnights as UTC ISO strings)
// plus its UTC offset, so tool queries land on exactly the same bounds the
// Stats page uses. Fall back to the server's own day if the client sent
// nothing usable.
function readDay(day: Partial<ChatDay> | undefined): ChatDay {
  const fallback = (): ChatDay => {
    const date = toLocalDateString(new Date());
    return { date, ...dayRange(date), tzOffset: new Date().getTimezoneOffset() };
  };
  if (
    !day ||
    typeof day.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day.date) ||
    typeof day.from !== "string" ||
    typeof day.to !== "string" ||
    Number.isNaN(Date.parse(day.from)) ||
    Number.isNaN(Date.parse(day.to))
  ) {
    return fallback();
  }
  return {
    date: day.date,
    from: day.from,
    to: day.to,
    tzOffset:
      typeof day.tzOffset === "number" && Number.isFinite(day.tzOffset) ? day.tzOffset : 0,
  };
}

// Cookie-backed Supabase client for the tool queries. Momentum has no sign-in
// step yet (the Stats page and the browser extension both read these tables
// with the publishable key, and the schema has no `user_id` column to scope
// by), so tool reads deliberately don't require a session — they run with
// whatever cookies the request carries and Postgres/RLS decides what is
// visible. Once sign-in and RLS exist, this same client narrows reads to the
// signed-in user with no change here.
async function createSession(): Promise<SupabaseClient> {
  return createClient(await cookies());
}

export async function POST(request: Request) {
  const config = readConfig(request);
  if (typeof config === "string") return jsonError(config, 400);

  let body: { messages?: ChatMessage[]; ping?: boolean; day?: Partial<ChatDay> };
  try {
    body = (await request.json()) as {
      messages?: ChatMessage[];
      ping?: boolean;
      day?: Partial<ChatDay>;
    };
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  // `ping` is the settings dialog's "Test connection": one tiny round-trip —
  // no tools, no stream.
  if (body.ping === true) {
    const { url, init } = upstreamRequest(
      config,
      [{ role: "user", content: "Reply with the single word OK." }],
      [],
      SYSTEM_PROMPT,
      false,
      [],
    );
    let upstream: Response;
    try {
      upstream = await fetch(url, init);
    } catch (error) {
      return jsonError(
        `Couldn't reach ${config.baseUrl} — check the base URL. (${(error as Error).message})`,
        502,
      );
    }
    if (!upstream.ok) {
      return jsonError(providerError(upstream.status, await upstream.text()), upstream.status);
    }
    await upstream.body?.cancel();
    return Response.json({ ok: true, provider: config.provider, model: config.model });
  }

  const messages: ChatMessage[] = (body.messages ?? []).filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0,
  );
  if (messages.length === 0) return jsonError("There is nothing to send yet.", 400);

  const day = readDay(body.day);
  const supabase = await createSession();
  const encoder = new TextEncoder();
  let stopped = false;

  const stream = new ReadableStream<Uint8Array>({
    // The tool loop drives itself: stream one model turn, run whatever tools
    // it asked for, send them back, repeat — until a turn answers with plain
    // text (which the client has been receiving as it arrived).
    async start(controller) {
      const emit = (chunk: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        } catch {
          // client went away; the `stopped` checks end the loop
        }
      };
      try {
        const rounds: ToolRound[] = [];
        // Tracks how much answer text has already reached the browser, so a
        // turn that answers with nothing at all can be reported instead of
        // leaving the chat silently empty.
        let streamed = 0;
        // TEMPORARY diagnostics for the "answer never shows up" report: records
        // what the provider actually sent during one turn. Reset every round.
        const debug = { raw: "", lines: 0, forwarded: 0 };
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          if (stopped) return;
          const { url, init } = upstreamRequest(
            config,
            messages,
            rounds,
            SYSTEM_PROMPT,
            true,
            AI_TOOLS,
          );
          let upstream: Response;
          try {
            upstream = await fetch(url, init);
          } catch (error) {
            throw new Error(
              `Couldn't reach ${config.baseUrl} — check the base URL. (${(error as Error).message})`,
            );
          }
          if (!upstream.ok) {
            throw new Error(providerError(upstream.status, await upstream.text()));
          }
          if (!upstream.body) throw new Error("The provider returned an empty stream.");

          const parser = createStreamParser(config.provider);
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (stopped) {
              await reader.cancel();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            // Providers frame SSE with LF, but some send CRLF and a few
            // gateways send newline-delimited JSON. Splitting on blank lines
            // (`"\n\n"`) misses those framings completely, which silently drops
            // the whole answer, so feed the parser one line at a time — it
            // reads the `data:` payloads itself.
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              debug.lines++;
              if (debug.raw.length < 400) debug.raw += line;
              const delta = parser.feed(line);
              if (delta) {
                streamed += delta.length;
                debug.forwarded += delta.length;
                emit({ text: delta });
              }
            }
          }

          const result = parser.end();
          console.log(
            `[ai-debug] round=${round} provider=${config.provider} model=${config.model} ` +
              `upstreamStatus=${upstream.status} dataLines=${debug.lines} forwarded=${debug.forwarded} ` +
              `turnText=${result.text.length} calls=${result.calls.length} error=${result.error ?? "none"}`,
          );
          if (!debug.forwarded) {
            console.log(`[ai-debug] upstream head=${JSON.stringify(debug.raw.slice(0, 400))}`);
          }
          debug.raw = "";
          debug.lines = 0;
          debug.forwarded = 0;
          if (result.error) throw new Error(result.error);
          if (result.calls.length === 0) {
            // A turn with neither text nor tool calls would leave the chat
            // empty with no explanation — say so instead.
            if (!streamed) {
              throw new Error(
                "The assistant returned an empty reply — check the model name in the AI settings.",
              );
            }
            break; // final answer, fully streamed
          }
          if (round === MAX_TOOL_ROUNDS) {
            throw new Error(
              "The assistant used too many tools without answering — please try again.",
            );
          }

          const calls: AiToolCall[] = [];
          for (const call of result.calls) {
            calls.push({ ...call, result: await executeAiTool(call, day, supabase) });
          }
          rounds.push({ text: result.text, calls });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        if (!stopped) {
          emit({ error: (error as Error).message });
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      stopped = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
