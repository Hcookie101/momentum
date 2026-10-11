// TEMPORARY diagnostic (safe to delete): verifies the route preloads today's
// data into the FIRST request's system prompt (so ordinary "today" questions
// cost one provider request instead of two) and that a no-tool prompt then
// completes in a single upstream round.
//   $ node scripts/tmp-preload-check.mjs   (needs the dev server on :3000)
import http from "node:http";

const PORT = 8794;

let systemText = "";
let calls = 0;

// OpenAI-shaped mock that answers immediately without asking for any tool —
// if the route still needed a tool round for this prompt, calls would exceed 1.
const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    calls += 1;
    systemText = String(body.messages?.[0]?.content ?? "");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Preload check OK." } }] })}\n\ndata: [DONE]\n\n`,
    );
  });
});
await new Promise((resolve) => upstream.listen(PORT, "127.0.0.1", resolve));

const now = new Date();
const day = {
  date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`,
  from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
  to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
  tzOffset: now.getTimezoneOffset(),
};

const response = await fetch("http://localhost:3000/api/ai", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": "sk-test",
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": "mock-model",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "How much did I focus today?" }],
    day,
  }),
});
const raw = await response.text();

const marker = systemText.includes("Data already fetched for you");
const focus = systemText.includes("focus_stats");
const browsing = systemText.includes("browsing_stats");
const schedule = systemText.includes("schedule");
const answered = raw.includes("Preload check OK.");
const ok = calls === 1 && marker && focus && browsing && schedule && answered;

console.log(`system prompt length: ${systemText.length}`);
console.log(`preload marker: ${marker}  focus: ${focus}  browsing: ${browsing}  schedule: ${schedule}`);
console.log(`upstream requests: ${calls}  answer streamed: ${answered}`);
console.log(ok ? "PRELOAD OK — today's data rides in the first request" : "PRELOAD MISSING");

upstream.close();
process.exit(ok ? 0 : 1);
