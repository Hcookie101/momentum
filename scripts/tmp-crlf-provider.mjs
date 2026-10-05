// TEMPORARY diagnostic (safe to delete): standalone mock "OpenAI" provider for
// scripts/tmp-framing-e2e.mjs. Round 1 asks for a tool (LF framing), round 2
// streams the answer with CRLF framing — the case that used to render nothing.
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8790);
const CRLF = process.env.CRLF !== "0";
const sep = CRLF ? "\r\n\r\n" : "\n\n";
let calls = 0;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (!(req.url ?? "").includes("chat/completions")) {
      res.writeHead(404).end("{}");
      return;
    }
    const body = JSON.parse(raw || "{}");
    calls++;
    const wantsToolCall = !(body.messages ?? []).some((m) => m.role === "tool");
    res.writeHead(200, { "Content-Type": "text/event-stream" });

    if (wantsToolCall) {
      const events = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "get_focus_stats", arguments: "" } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"date":"2026-09-30"}' } }] } }] },
      ];
      res.end(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n");
      return;
    }

    // Answer round. ECHO=1 streams the executed tool result back as the answer,
    // so the bubble shows exactly what the model received from the tools.
    if (process.env.ECHO === "1") {
      const toolMessage = [...(body.messages ?? [])].reverse().find((m) => m.role === "tool");
      let result = toolMessage?.content ?? "no tool result";
      try {
        result = JSON.stringify(JSON.parse(result));
      } catch {
        /* leave as-is */
      }
      res.end(
        [`data: ${JSON.stringify({ choices: [{ delta: { content: String(result).slice(0, 700) } }] })}${sep}`, `data: [DONE]${sep}`].join(""),
      );
      return;
    }

    res.end(
      ["You focused", " for 1h45m", " today."]
        .map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}${sep}`)
        .join("") + `data: [DONE]${sep}`,
    );
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock provider on http://127.0.0.1:${PORT}/v1 (framing: ${CRLF ? "CRLF" : "LF"})`);
});
process.on("SIGTERM", () => {
  console.log(`mock provider served ${calls} upstream call(s)`);
  server.close(() => process.exit(0));
});
