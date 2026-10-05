// TEMPORARY diagnostic (safe to delete): talks to the real /api/ai route with
// a mock OpenAI upstream and prints the SSE the route streams back. Run it with
// different framings to see how the route copes:
//   $env:FRAMING="lf"   ; node scripts/tmp-framing-route.mjs
//   $env:FRAMING="crlf" ; node scripts/tmp-framing-route.mjs
//   $env:TOOLS="1"      ; node scripts/tmp-framing-route.mjs   # tool loop
//   $env:EMPTY="1"      ; node scripts/tmp-framing-route.mjs   # empty reply
import http from "node:http";

const PORT = 8790;
const FRAMING = (process.env.FRAMING ?? "lf").toLowerCase();
const TOOLS = process.env.TOOLS === "1";
const EMPTY = process.env.EMPTY === "1";
const sep = FRAMING === "crlf" ? "\r\n\r\n" : "\n\n";

const seen = [];
const answer = (body) =>
  ["You focused", " for 1h45m", " today."].map(
    (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}${sep}`,
  );

const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (!(req.url ?? "").includes("chat/completions")) {
      res.writeHead(404).end("{}");
      return;
    }
    const body = JSON.parse(raw || "{}");
    seen.push(body);
    res.writeHead(200, { "Content-Type": "text/event-stream" });

    if (EMPTY) {
      res.end(`data: [DONE]${sep}`);
      return;
    }

    const hasToolResult = (body.messages ?? []).some((m) => m.role === "tool");
    if (TOOLS && !hasToolResult) {
      // A tool call split across events, exactly like a real provider: the id
      // and name first, the arguments in fragments.
      const events = [
        { choices: [{ delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", function: { name: "get_focus_stats", arguments: "" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"date"' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"2026-09-30"}' } }] } }] },
      ];
      res.end(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n");
      return;
    }

    res.end(answer(body).join("") + `data: [DONE]${sep}`);
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

const started = Date.now();
let response;
try {
  response = await fetch("http://localhost:3000/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ai-provider": "openai",
      "x-ai-key": "sk-test",
      "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
      "x-ai-model": "gpt-4o-mini",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "How much did I focus today?" }], day }),
  });
} catch (error) {
  console.log(`FRAMING=${FRAMING} -> could not reach the app: ${error.message}`);
  upstream.close();
  process.exit(1);
}

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

console.log(`FRAMING=${FRAMING}  status=${response.status}  ${Date.now() - started}ms`);
console.log(`upstream requests: ${seen.length}  last roles: ${JSON.stringify((seen.at(-1)?.messages ?? []).map((m) => m.role))}`);
console.log(`events: ${JSON.stringify(events)}`);
console.log(`text assembled by the client parser: ${JSON.stringify(text)}`);
console.log(`error surfaced: ${error ?? "none"}`);
console.log(`raw first 120 chars: ${JSON.stringify(raw.slice(0, 120))}`);

upstream.close();
process.exit(0);
