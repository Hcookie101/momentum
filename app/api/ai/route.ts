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
import type { ChatDay, ScheduleProposal } from "@/app/lib/ai";
import { AI_TOOLS, executeAiTool, type AiToolCall } from "@/app/lib/ai-tools";
import {
  createStreamParser,
  modelListedIn,
  modelsListRequest,
  providerError,
  readProviderConfig,
  type ToolRound,
  upstreamRequest,
} from "@/app/lib/ai-providers";
import {
  parseQuotaLimits,
  refund,
  reserve,
  retryDelayMs,
  sleep,
  usage,
} from "@/app/lib/quota";
import { dayRange, toLocalDateString } from "@/app/lib/stats";

export const SYSTEM_PROMPT =
  "You are the assistant built into Momentum, a personal focus and " +
  "productivity dashboard with goals, obligations, a weekly schedule and " +
  "focus statistics. You have tools that read the user's live dashboard " +
  "data — call them whenever a question is about the user's own time, " +
  "focus, browsing, goals or schedule instead of guessing. Every prompt " +
  "already carries today's focus, browsing and schedule numbers: answer " +
  "questions about today straight from them and call tools only for other " +
  "dates or details they don't cover. When you do need tools, ask for " +
  "everything you need in a single reply — all results come back together " +
  "— never for one tool after another, because each extra round costs the " +
  "provider another full request. Dates and times in tool results are the " +
  "user's local time. You can also change the weekly calendar: when the " +
  "user asks to add, move or remove schedule events, read the schedule and " +
  "then call propose_schedule_changes with the full batch. That only stages " +
  "the changes — the user reviews them on an approval card and nothing is " +
  "written until they click Approve, so never claim a change already " +
  "happened. Answer briefly and practically.";

// One reply may chain at most this many tool rounds before we give up.
const MAX_TOOL_ROUNDS = 4;

type ChatMessage = { role: "user" | "assistant"; content: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
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

// Today's data, preloaded into the first request: the same three tool reads
// (focus, browsing, schedule) the model would otherwise ask for, run locally
// against Supabase — which costs nothing — so the usual "today" questions get
// their answer from round one instead of spending a second provider request
// on a tool round (and a second full re-send of the conversation). Any
// failure falls back silently: the tools still work.
async function preloadedToday(day: ChatDay, supabase: SupabaseClient): Promise<string> {
  try {
    const [focus, browsing, schedule] = await Promise.all([
      executeAiTool({ id: "preload_focus", name: "get_focus_stats", args: {} }, day, supabase),
      executeAiTool({ id: "preload_browsing", name: "get_browsing_stats", args: {} }, day, supabase),
      executeAiTool(
        { id: "preload_schedule", name: "get_schedule", args: { date: day.date } },
        day,
        supabase,
      ),
    ]);
    return (
      `\n\nData already fetched for you for today (${day.date}) — when the question is ` +
      `about today, answer straight from this instead of calling the tools (call tools ` +
      `only for other dates, goals or details it doesn't cover):\n` +
      JSON.stringify({ focus_stats: focus, browsing_stats: browsing, schedule })
    );
  } catch {
    return "";
  }
}

// Cookie-backed Supabase client for the tool queries. Every table is
// owner-scoped by RLS (see supabase/migrations/…), so these reads only see
// the signed-in caller's own rows — Postgres decides what's visible from the
// request's cookies, and a denied read surfaces as `{ error }` the model
// relays. No user_id filtering is needed here; RLS does it.
async function createSession(): Promise<SupabaseClient> {
  return createClient(await cookies());
}

export async function POST(request: Request) {
  // The middleware only gates page paths, so API routes check the session
  // themselves — before parsing provider config or reaching upstream.
  const supabase = await createSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("You're signed out — log back in and try again.", 401);

  const config = readProviderConfig(request);
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

  // `ping` is the settings dialog's "Test connection": it asks the provider
  // for its model list instead of generating a reply — the same proof that
  // the key and base URL work, but it spends no quota, and it lets us flag a
  // model name that isn't in the list before every prompt fails on it.
  if (body.ping === true) {
    const list = modelsListRequest(config);
    let upstream: Response;
    try {
      upstream = await fetch(list.url, list.init);
    } catch (error) {
      return jsonError(
        `Couldn't reach ${config.baseUrl} — check the base URL. (${(error as Error).message})`,
        502,
      );
    }
    // Gateways without a models endpoint fall back to a real (tiny) ping.
    if (upstream.status !== 404 && upstream.status !== 405) {
      if (!upstream.ok) {
        return jsonError(providerError(upstream.status, await upstream.text()), upstream.status);
      }
      let modelListed = true;
      try {
        modelListed = modelListedIn(await upstream.json(), config.model);
      } catch {
        // an unparseable list shouldn't fail an otherwise working key
      }
      return Response.json({
        ok: true,
        provider: config.provider,
        model: config.model,
        modelListed,
      });
    }

    const ping = upstreamRequest(
      config,
      [{ role: "user", content: "Reply with the single word OK." }],
      [],
      SYSTEM_PROMPT,
      false,
      [],
    );
    try {
      upstream = await fetch(ping.url, ping.init);
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
        // Stream a first quota event up front: the badge appears (and the
        // response flushes) before any rate-limit waiting or preload work.
        const quotaKey = `${config.provider}:${config.model}`;
        const quotaLimits = parseQuotaLimits(request.headers.get("x-ai-quota"));
        if (quotaLimits) emit({ quota: usage(quotaKey, quotaLimits) });
        // Today's numbers ride along in the system prompt so most prompts are
        // answered in a single request — see preloadedToday.
        const system = SYSTEM_PROMPT + (await preloadedToday(day, supabase));
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
            system,
            true,
            AI_TOOLS,
          );
          // Free-tier budget (see app/lib/quota.ts): reserve a slot — waiting
          // out the per-minute window, refusing once the day is spent before
          // anything is sent. Transient failures get a short wait-and-retry,
          // following Google's pinned guidance ("a low number of retries with
          // a short timeout at first"): 429 rate limits get up to three tries
          // — a rejected request never reached the quota, so its slot is
          // refunded — while 5xx "high demand" overload gets exactly one
          // retry. Google calls 503s "unrelated to your quota", but free-tier
          // audit reports on the developer forum say they still tick the daily
          // counter, so a 503 slot stays spent: one retry salvages a brief
          // spike without letting a model-level outage bleed the day dry.
          let upstream: Response | null = null;
          let retryBody = "";
          for (let attempt = 0; attempt < 3; attempt++) {
            retryBody = "";
            if (quotaLimits) {
              const verdict = await reserve(quotaKey, quotaLimits);
              emit({ quota: usage(quotaKey, quotaLimits) });
              if (!verdict.ok) throw new Error(verdict.message);
            }
            let response: Response;
            try {
              response = await fetch(url, init);
            } catch (error) {
              throw new Error(
                `Couldn't reach ${config.baseUrl} — check the base URL. (${(error as Error).message})`,
              );
            }
            const status = response.status;
            const transient = status === 429 || status >= 500;
            const maxAttempts = status === 429 ? 3 : 2;
            if (!transient || attempt + 1 >= maxAttempts) {
              upstream = response;
              break;
            }
            retryBody = await response.text();
            if (status === 429 && quotaLimits) refund(quotaKey);
            const wait = retryDelayMs(response.headers, retryBody);
            console.log(`[ai-debug] retry status=${status} attempt=${attempt + 1} wait=${wait}ms`);
            await sleep(wait);
          }
          if (!upstream) throw new Error("The provider did not reply.");
          if (!upstream.ok) {
            // A retried failure's body was already read into `retryBody`.
            const detail = retryBody || (await upstream.text());
            const message = providerError(upstream.status, detail);
            throw new Error(
              upstream.status >= 500
                ? `${message} — retried without success; if it keeps happening, ` +
                  `try a different model in the AI settings.`
                : message,
            );
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
            const toolResult = await executeAiTool(call, day, supabase);
            // A staged schedule change never runs silently: forward it to the
            // browser as an approval card. The tool result handed back to the
            // model keeps only a note — the write itself waits for the user's
            // click, and the write route never sends the token back through
            // the model, so a prompt-injected "apply it" can't act alone.
            const staged = toolResult as { proposal?: ScheduleProposal } | null;
            const proposal = staged?.proposal;
            if (proposal) emit({ proposal });
            calls.push({
              ...call,
              result: proposal
                ? {
                    ok: true,
                    message:
                      "Staged for the user's approval — an approval card is on screen. " +
                      "Tell them to review and click Approve (or Reject); do NOT call " +
                      "any more tools, and do not repeat the details already on the card.",
                  }
                : toolResult,
            });
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
