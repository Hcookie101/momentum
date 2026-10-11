// TEMPORARY diagnostic (safe to delete): free-tier quota handling on /api/ai —
// the streamed `quota` badge events, refusing to spend past the daily cap, and
// waiting out a 429 (Gemini-style RetryInfo delay) instead of surfacing it.
//   $ node scripts/tmp-quota-route.mjs   (needs the dev server on :3000)
import http from "node:http";

const PORT = 8793;

const seen = []; // every upstream call, by model
let retryCalls = 0;
let fifty3Calls = 0;

// OpenAI-shaped mock: always asks for one tool, then answers. The model named
// "retry-model" gets a 429 (with a 1s RetryInfo delay) on its very first call;
// models named "fifty3-*" get one "high demand" 503 first instead.
const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const model = String(body.model ?? "");
    seen.push(model);

    if (model === "retry-model" && ++retryCalls === 1) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 429,
            message: "Resource has been exhausted",
            status: "RESOURCE_EXHAUSTED",
            details: [
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1s" },
            ],
          },
        }),
      );
      return;
    }

    if (model.startsWith("fifty3-") && ++fifty3Calls === 1) {
      res.writeHead(503, { "Content-Type": "application/json", "retry-after": "1" });
      res.end(
        JSON.stringify({
          error: {
            code: 503,
            message:
              "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
            status: "UNAVAILABLE",
          },
        }),
      );
      return;
    }

    if (model.startsWith("fifty3twice-")) {
      // A model-level outage: 503s every single time.
      res.writeHead(503, { "Content-Type": "application/json", "retry-after": "1" });
      res.end(
        JSON.stringify({
          error: {
            code: 503,
            message:
              "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
            status: "UNAVAILABLE",
          },
        }),
      );
      return;
    }

    const hasToolResult = (body.messages ?? []).some((m) => m.role === "tool");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (!hasToolResult) {
      res.end(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "call_1", function: { name: "get_focus_stats", arguments: "{}" } },
                ],
              },
            },
          ],
        })}\n\ndata: [DONE]\n\n`,
      );
    } else {
      res.end(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: "You focused for 1h45m today." } }],
        })}\n\ndata: [DONE]\n\n`,
      );
    }
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

async function ask(model, quota) {
  const headers = {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": "sk-test",
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": model,
  };
  if (quota !== undefined) headers["x-ai-quota"] = quota;
  const response = await fetch("http://localhost:3000/api/ai", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages: [{ role: "user", content: "How much did I focus today?" }],
      day,
    }),
  });
  const raw = await response.text();
  let text = "";
  let error = null;
  const quotas = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "[DONE]") continue;
    try {
      const chunk = JSON.parse(payload);
      if (chunk.quota) quotas.push(chunk.quota);
      if (chunk.error) error = chunk.error;
      if (chunk.text) text += chunk.text;
    } catch {
      // not JSON — ignore
    }
  }
  return { status: response.status, text, error, quotas };
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// Quota buckets live in the dev-server process and survive across runs (they
// only reset at Pacific midnight or a server restart), so the quota scenarios
// use fresh model names for a clean bucket — as would any new connection.
const RUN = Date.now().toString(36);

// 1. Badge: quota events arrive and count every upstream round.
const badge = await ask(`badge-${RUN}`, "5/60");
check(
  "badge events carry the configured limit",
  badge.quotas.length > 0 && badge.quotas.every((q) => q.limit === 5 && Number.isInteger(q.used)),
  JSON.stringify(badge.quotas),
);
check(
  "badge counted both upstream rounds",
  badge.quotas.at(-1)?.used === 2,
  JSON.stringify(badge.quotas.at(-1)),
);
check(
  "prompt still completes",
  !badge.error && badge.text.includes("1h45m"),
  badge.error ?? JSON.stringify(badge.text),
);

// 2. Daily cap: with a budget of 1, the second round is refused before a
//    request is spent, and the badge shows the spend.
const blocked = await ask(`blocked-${RUN}`, "1/60");
check(
  "daily cap refusal is surfaced",
  typeof blocked.error === "string" && /quota/i.test(blocked.error),
  blocked.error ?? "no error",
);
const blockedCalls = seen.filter((m) => m.startsWith("blocked-")).length;
check("only one upstream request was spent", blockedCalls === 1, `saw ${blockedCalls}`);
check(
  "badge shows the spend",
  blocked.quotas.at(-1)?.limit === 1 && blocked.quotas.at(-1)?.used === 1,
  JSON.stringify(blocked.quotas.at(-1)),
);

// 3. 429 with RetryInfo: the route waits the requested delay and retries —
//    the prompt still completes instead of failing.
const started = Date.now();
const retried = await ask("retry-model");
const retrySeen = seen.filter((m) => m === "retry-model").length;
check(
  "429 retried, prompt completes",
  !retried.error && retried.text.includes("1h45m"),
  retried.error ?? JSON.stringify(retried.text),
);
check("429 + retry + tool round + answer = 3 calls", retrySeen === 3, `saw ${retrySeen}`);
check("waited for the retry delay", Date.now() - started >= 900, `${Date.now() - started}ms`);

// 4. "High demand" 503: retried per Google's official guidance, and the
//    failed attempt stays counted (Google's developer forum reports 503s
//    consume free-tier RPD even though no useful work was done).
const fifty3 = await ask(`fifty3-${RUN}`, "9/60");
check(
  "503 retried, prompt completes",
  !fifty3.error && fifty3.text.includes("1h45m"),
  fifty3.error ?? JSON.stringify(fifty3.text),
);
const fifty3Seen = seen.filter((m) => m.startsWith("fifty3-")).length;
check("503 + retry + tool round + answer = 3 calls", fifty3Seen === 3, `saw ${fifty3Seen}`);
check(
  "failed 503 attempt stays counted in the badge",
  fifty3.quotas.at(-1)?.used === 3 && fifty3.quotas.at(-1)?.limit === 9,
  JSON.stringify(fifty3.quotas.at(-1)),
);

// 5. Sustained 503 outage: exactly one retry (two attempts total), then a
//    clear error — a model-level outage must not bleed the daily budget.
const outage = await ask(`fifty3twice-${RUN}`, "9/60");
const outageSeen = seen.filter((m) => m.startsWith("fifty3twice-")).length;
check(
  "sustained 503 surfaces the error",
  typeof outage.error === "string" && /high demand/.test(outage.error),
  outage.error ?? "no error",
);
check(
  "error explains the retry and the next step",
  /different model/i.test(outage.error ?? ""),
  outage.error ?? "no error",
);
check("only two attempts spent", outageSeen === 2, `saw ${outageSeen}`);
check(
  "badge shows exactly the two attempts",
  outage.quotas.at(-1)?.used === 2 && outage.quotas.at(-1)?.limit === 9,
  JSON.stringify(outage.quotas.at(-1)),
);

upstream.close();
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
