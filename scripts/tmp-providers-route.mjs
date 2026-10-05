// TEMPORARY diagnostic (safe to delete): exercises the real /api/ai route with
// provider-shaped mock upstreams — OpenAI, Anthropic and Gemini — covering both
// a tool round (fragmented arguments) and the streamed answer, and reports what
// the route sent to the browser.
//   $env:PROVIDER="anthropic"; node scripts/tmp-providers-route.mjs
//   $env:ECHO="1"            ; node scripts/tmp-providers-route.mjs
//   -> ECHO streams the executed tool result back as the answer, so the printed
//      text is exactly what the model received from the tools.
import http from "node:http";

const PORT = 8791;
const PROVIDER = (process.env.PROVIDER ?? "openai").toLowerCase();
const ECHO = process.env.ECHO === "1";
const TOOL_ARGS = { date: process.env.DAY ?? new Date().toISOString().slice(0, 10) };

// The tool round the mock asks for: the browsing tool by default (or a specific
// one via TOOL=<name>, which takes no required args).
const TOOL_NAME = process.env.TOOL ?? "get_browsing_stats";

const seen = [];

// ---- provider-shaped SSE bodies ----
function openaiEvents(hasToolResult, toolResult) {
  if (ECHO && hasToolResult) {
    return [`data: ${JSON.stringify({ choices: [{ delta: { content: "TOOL RESULT: " + JSON.stringify(toolResult) } }] })}\n\n`, "data: [DONE]\n\n"];
  }
  if (!hasToolResult) {
    return [
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: TOOL_NAME, arguments: "" } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(TOOL_ARGS).slice(0, 8) } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify(TOOL_ARGS).slice(8) } }] } }] },
    ].map((e) => `data: ${JSON.stringify(e)}\n\n`).concat("data: [DONE]\n\n");
  }
  return ["You focused", " for 1h45m", " today."]
    .map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
    .concat("data: [DONE]\n\n");
}

function anthropicEvents(hasToolResult, toolResult) {
  const ev = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
  const args = JSON.stringify(TOOL_ARGS);
  const out = [ev("message_start", { type: "message_start", message: { id: "msg_1", role: "assistant" } })];
  if (!hasToolResult) {
    out.push(ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: TOOL_NAME } }));
    // Arguments always arrive as fragmented JSON.
    out.push(ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: args.slice(0, 8) } }));
    out.push(ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: args.slice(8) } }));
    out.push(ev("content_block_stop", { type: "content_block_stop", index: 0 }));
  } else {
    out.push(ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }));
    const chunks = ECHO
      ? ["TOOL RESULT: " + JSON.stringify(toolResult)]
      : ["You focused", " for 1h45m", " today."];
    for (const text of chunks) {
      out.push(ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }));
    }
    out.push(ev("content_block_stop", { type: "content_block_stop", index: 0 }));
  }
  out.push(ev("message_stop", { type: "message_stop" }));
  return out;
}

const GEMINI_SIGNATURE = "sig_abc123";
function geminiEvents(hasToolResult, toolResult) {
  const ev = (part) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [part] } }] })}\n\n`;
  if (!hasToolResult) {
    // Gemini 3 style: the signature rides on the FIRST functionCall part, and a
    // second parallel call follows without one — replaying them out of order or
    // without the signature is what triggers the 400.
    return [
      ev({ text: "Checking your focus…" }),
      ev({
        functionCall: { name: TOOL_NAME, args: TOOL_ARGS },
        thoughtSignature: GEMINI_SIGNATURE,
      }),
      ev({ functionCall: { name: "get_browsing_stats", args: { date: TOOL_ARGS.date } } }),
    ];
  }
  const chunks = ECHO
    ? ["TOOL RESULT: " + JSON.stringify(toolResult)]
    : ["You focused", " for 1h45m", " today."];
  return chunks.map((text) => ev({ text }));
}

const BUILDERS = { openai: openaiEvents, anthropic: anthropicEvents, gemini: geminiEvents };

// Pull the executed tool result back out of whatever the route sent upstream.
function toolResultFrom(body) {
  if (PROVIDER === "openai") {
    const message = [...(body.messages ?? [])].reverse().find((m) => m.role === "tool");
    try {
      return message ? JSON.parse(message.content) : null;
    } catch {
      return message?.content ?? null;
    }
  }
  if (PROVIDER === "anthropic") {
    for (const message of [...(body.messages ?? [])].reverse()) {
      const blocks = Array.isArray(message.content) ? message.content : [];
      const result = blocks.find((b) => b.type === "tool_result");
      if (result) return typeof result.content === "string" ? JSON.parse(result.content) : result.content;
    }
    return null;
  }
  for (const content of [...(body.contents ?? [])].reverse()) {
    const part = (content.parts ?? []).find((p) => p.functionResponse);
    if (part) return part.functionResponse.response;
  }
  return null;
}

const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    seen.push({ url: req.url ?? "", body });
    const hasToolResult =
      PROVIDER === "openai"
        ? (body.messages ?? []).some((m) => m.role === "tool")
        : PROVIDER === "anthropic"
          ? JSON.stringify(body.messages ?? []).includes('"tool_result"')
          : JSON.stringify(body.contents ?? []).includes('"functionResponse"');
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(BUILDERS[PROVIDER](hasToolResult, toolResultFrom(body)).join(""));
  });
});
await new Promise((r) => upstream.listen(PORT, "127.0.0.1", r));


const date = new Date();
const day = {
  date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  from: new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString(),
  to: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).toISOString(),
  tzOffset: date.getTimezoneOffset(),
};

const response = await fetch("http://localhost:3000/api/ai", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ai-provider": PROVIDER,
    "x-ai-key": "sk-test",
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": "mock-model",
  },
  body: JSON.stringify({ messages: [{ role: "user", content: "How much did I focus today?" }], day }),
});

const raw = await response.text();
const events = raw
  .split(/\r?\n/)
  .filter((line) => line.startsWith("data:"))
  .map((line) => line.slice(5).trim());
let text = "";
let error = null;
for (const payload of events) {
  if (payload === "[DONE]") continue;
  try {
    const chunk = JSON.parse(payload);
    if (chunk.text) text += chunk.text;
    if (chunk.error) error = chunk.error;
  } catch {
    /* ignore */
  }
}

const lastCall = seen.at(-1);
const shape =
  PROVIDER === "openai"
    ? JSON.stringify((lastCall?.body.messages ?? []).map((m) => m.role))
    : PROVIDER === "anthropic"
      ? JSON.stringify(
          (lastCall?.body.messages ?? []).map((m) =>
            typeof m.content === "string"
              ? `${m.role}:text`
              : `${m.role}:${m.content.map((b) => b.type).join("+")}`,
          ),
        )
      : JSON.stringify(
          (lastCall?.body.contents ?? []).map(
            (c) => `${c.role}:${c.parts.map((p) => Object.keys(p)[0]).join("+")}`,
          ),
        );

console.log(`PROVIDER=${PROVIDER}  status=${response.status}`);
if (PROVIDER === "gemini") {
  const replay = JSON.stringify(lastCall?.body.contents ?? []);
  console.log(`thoughtSignature echoed back: ${replay.includes(GEMINI_SIGNATURE)}`);
}
console.log(`upstream calls: ${seen.length}`);
console.log(`last upstream shape: ${shape}`);
console.log(`text assembled by the client parser: ${JSON.stringify(text)}`);
console.log(`error surfaced: ${error ?? "none"}`);

upstream.close();
process.exit(0);
