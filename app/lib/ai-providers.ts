// Provider-specific plumbing for the AI chat route: how OpenAI, Anthropic
// and Gemini each want messages, system prompts and tool declarations shaped,
// plus streaming parsers that reassemble their SSE replies — forwarded text
// deltas on one hand, tool calls (which may arrive across many events) on the
// other. Pure functions only, so app/api/ai/route.ts stays a thin loop.

import type { ChatMessage } from "@/app/lib/ai";
import type { AiToolCall, AiToolDefinition } from "@/app/lib/ai-tools";

export type ProviderId = "openai" | "anthropic" | "gemini";

export type ProviderConfig = {
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
};

// One completed model turn that asked for tools: whatever text it said plus
// the calls. The route fills `result` before sending the next round.
export type ToolRound = { text: string; calls: AiToolCall[] };

export type ParsedStream = { text: string; calls: AiToolCall[]; error: string | null };

// One SSE data payload as any provider might send it — each branch reads the
// fields it cares about (union of the three wire formats, all optional).
type StreamChunk = {
  choices?: {
    delta?: {
      content?: string;
      tool_calls?: {
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  error?: { message?: string };
  type?: string;
  index?: number;
  content_block?: { type?: string; text?: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string };
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        // Gemini 3 thinking models: reasoning parts and their opaque signature.
        thought?: boolean;
        thoughtSignature?: string;
        functionCall?: { name?: string; args?: Record<string, unknown> };
      }[];
    };
  }[];
};

// Anthropic requires a token cap and Gemini takes it as `maxOutputTokens`.
// Thinking models (Gemini 3 and 2.5) count their reasoning against the same
// budget, so a small cap can leave no room for the answer itself.
export const MAX_TOKENS = 8192;

function asJson(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value: value as string | number | boolean | null };
}

// Builds the upstream HTTP request. `tools` is empty for the settings
// dialog's ping (no tools, no stream); chat rounds pass AI_TOOLS.
export function upstreamRequest(
  config: ProviderConfig,
  messages: ChatMessage[],
  rounds: ToolRound[],
  system: string,
  stream: boolean,
  tools: AiToolDefinition[],
): { url: string; init: RequestInit } {
  const body = buildMessages(config.provider, messages, rounds);

  // Gemini puts the model in the path (`…/models/{model}:action`) and carries
  // the key in x-goog-api-key. Streaming adds `alt=sse`, which replies with
  // `data: {"candidates":[{"content":{"parts":[{"text":"…"}]}}]}` events; with
  // the default (non fine-grained) mode, function calls arrive as a single
  // complete `functionCall` part.
  if (config.provider === "gemini") {
    const action = stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
    return {
      url: `${config.baseUrl}/models/${encodeURIComponent(config.model)}${action}`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: body,
          ...(tools.length
            ? {
                tools: [
                  {
                    functionDeclarations: tools.map(({ name, description, parameters }) => ({
                      name,
                      description,
                      parameters,
                    })),
                  },
                ],
              }
            : {}),
          generationConfig: { maxOutputTokens: MAX_TOKENS },
        }),
      },
    };
  }

  if (config.provider === "anthropic") {
    return {
      url: `${config.baseUrl}/messages`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: MAX_TOKENS,
          system,
          messages: body,
          stream,
          ...(tools.length
            ? {
                tools: tools.map(({ name, description, parameters }) => ({
                  name,
                  description,
                  input_schema: parameters,
                })),
              }
            : {}),
        }),
      },
    };
  }

  // openai (and compatible servers)
  return {
    url: `${config.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "system", content: system }, ...body],
        stream,
        ...(tools.length
          ? {
              tools: tools.map(({ name, description, parameters }) => ({
                type: "function",
                function: { name, description, parameters },
              })),
              tool_choice: "auto",
            }
          : {}),
      }),
    },
  };
}

// Converts the plain user/assistant history plus any completed tool rounds
// into the message shape each provider requires.
export function buildMessages(
  provider: ProviderId,
  base: ChatMessage[],
  rounds: ToolRound[],
): unknown[] {
  if (provider === "anthropic") {
    const out: unknown[] = base.map((message) => ({
      role: message.role,
      content: message.content,
    }));
    for (const round of rounds) {
      // tool_use block(s) must be answered by a user message of tool_result.
      const assistant: unknown[] = [];
      if (round.text) assistant.push({ type: "text", text: round.text });
      for (const call of round.calls) {
        assistant.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      }
      out.push({ role: "assistant", content: assistant });
      out.push({
        role: "user",
        content: round.calls.map((call) => ({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(call.result ?? null),
        })),
      });
    }
    return out;
  }

  if (provider === "gemini") {
    const out: unknown[] = base.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));
    for (const round of rounds) {
      // Gemini alternates model turns (functionCall) and user turns
      // (functionResponse); ids aren't used, names pair the two up.
      const model: unknown[] = [];
      if (round.text) model.push({ text: round.text });
      for (const call of round.calls) {
        model.push({
          functionCall: { name: call.name, args: call.args },
          // Send the model's own signature back with the call it belongs to —
          // without it Gemini 3 answers the next turn with a 400
          // ("Function call is missing a thought_signature in functionCall parts").
          ...(call.signature ? { thoughtSignature: call.signature } : {}),
        });
      }
      out.push({ role: "model", parts: model });
      out.push({
        role: "user",
        parts: round.calls.map((call) => ({
          functionResponse: { name: call.name, response: asJson(call.result) },
        })),
      });
    }
    return out;
  }

  // openai (and compatible servers)
  const out: unknown[] = base.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  for (const round of rounds) {
    out.push({
      role: "assistant",
      content: round.text || null,
      tool_calls: round.calls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.args) },
      })),
    });
    for (const call of round.calls) {
      out.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(call.result ?? null) });
    }
  }
  return out;
}

function parseArgs(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// Assembles one streamed provider reply: `feed` is called for every SSE event
// and returns any text delta to forward to the client immediately; `end` is
// called when the upstream stream closes and yields the full text plus the
// accumulated tool calls (their arguments can span many events).
export function createStreamParser(provider: ProviderId) {
  let text = "";
  let error: string | null = null;
  let sequence = 0;

  // Gemini: the first signature the model attaches to this turn (it lands on
  // the first functionCall part, but thinking models sometimes put it on a
  // neighbouring thought part) — replayed with the calls below.
  let geminiSignature: string | undefined;

  // openai: `delta.tool_calls` fragments keyed by index
  const openaiCalls: { id: string; name: string; args: string }[] = [];
  // anthropic: content blocks keyed by index (text or tool_use)
  const blocks = new Map<
    number,
    { type: string; text?: string; id?: string; name?: string; json?: string }
  >();
  // gemini: complete `functionCall` parts (fine-grained arg streaming is off)
  const geminiCalls: {
    name: string;
    args: Record<string, unknown>;
    signature?: string;
  }[] = [];

  function feed(event: string): string {
    let forward = "";
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue; // keep-alives and anything we can't parse
      }
      const chunk = parsed as StreamChunk;

      if (provider === "openai") {
        const delta = chunk.choices?.[0]?.delta;
        if (typeof delta?.content === "string" && delta.content) {
          text += delta.content;
          forward += delta.content;
        }
        for (const part of delta?.tool_calls ?? []) {
          const slot = (openaiCalls[part.index ?? 0] ??= { id: "", name: "", args: "" });
          if (typeof part.id === "string" && part.id) slot.id = part.id;
          if (typeof part.function?.name === "string") slot.name += part.function.name;
          if (typeof part.function?.arguments === "string") slot.args += part.function.arguments;
        }
        if (typeof chunk.error?.message === "string") error ??= chunk.error.message;
      } else if (provider === "anthropic") {
        if (chunk.type === "content_block_start") {
          const block = chunk.content_block;
          blocks.set(
            chunk.index ?? 0,
            block?.type === "tool_use"
              ? { type: "tool_use", id: block.id, name: block.name, json: "" }
              : { type: "text", text: typeof block?.text === "string" ? block.text : "" },
          );
        } else if (chunk.type === "content_block_delta") {
          const block = blocks.get(chunk.index ?? -1);
          if (!block) continue;
          if (chunk.delta?.type === "text_delta" && typeof chunk.delta.text === "string") {
            block.text = (block.text ?? "") + chunk.delta.text;
            text += chunk.delta.text;
            forward += chunk.delta.text;
          } else if (
            chunk.delta?.type === "input_json_delta" &&
            typeof chunk.delta.partial_json === "string"
          ) {
            block.json = (block.json ?? "") + chunk.delta.partial_json;
          }
        } else if (chunk.type === "error") {
          error ??= chunk.error?.message ?? "The provider reported a stream error.";
        }
      } else {
        // gemini
        if (chunk.error?.message) {
          error ??= chunk.error.message;
          continue;
        }
        const parts = chunk.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          const signature =
            typeof part.thoughtSignature === "string" && part.thoughtSignature
              ? part.thoughtSignature
              : undefined;
          geminiSignature ??= signature;
          if (typeof part.text === "string" && part.text) {
            text += part.text;
            forward += part.text;
          } else if (typeof part.functionCall?.name === "string") {
            geminiCalls.push({
              name: part.functionCall.name,
              args:
                part.functionCall.args && typeof part.functionCall.args === "object"
                  ? part.functionCall.args
                  : {},
              ...(signature ? { signature } : {}),
            });
          }
        }
      }
    }
    return forward;
  }

  function end(): ParsedStream {
    const calls: AiToolCall[] = [];
    let malformed = false;

    if (provider === "openai") {
      for (const slot of openaiCalls) {
        if (!slot.name) continue;
        const args = parseArgs(slot.args);
        if (args === null) malformed = true;
        calls.push({ id: slot.id || `call_${++sequence}`, name: slot.name, args: args ?? {} });
      }
    } else if (provider === "anthropic") {
      const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]);
      for (const [, block] of ordered) {
        if (block.type !== "tool_use" || !block.name) continue;
        const args = parseArgs(block.json ?? "");
        if (args === null) malformed = true;
        calls.push({ id: block.id || `call_${++sequence}`, name: block.name, args: args ?? {} });
      }
    } else {
      for (const [index, call] of geminiCalls.entries()) {
        // Gemini 3 requires the turn's thought signature back on the first
        // function call; fall back to the turn's signature when the model
        // attached it to a neighbouring (e.g. thought) part instead.
        const signature = call.signature ?? (index === 0 ? geminiSignature : undefined);
        calls.push({
          id: `call_${++sequence}`,
          name: call.name,
          args: call.args,
          ...(signature ? { signature } : {}),
        });
      }
    }

    if (malformed) {
      return { text, calls: [], error: error ?? "The provider sent malformed tool arguments." };
    }
    return { text, calls, error };
  }

  return { feed, end };
}
