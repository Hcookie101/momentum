// TEMPORARY diagnostic (safe to delete): read-only view of the free-tier
// budget (GET /api/ai/quota) — the live counter, spent nothing to get it,
// quota-keyed per model, absent without the header.
//   $ node scripts/tmp-quota-read-route.mjs   (needs the dev server on :3000)
import http from "node:http";

const PORT = 8794;

const upstream = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});
await new Promise((resolve) => upstream.listen(PORT, "127.0.0.1", resolve));

async function ask(model, { key = "sk-test", quota } = {}) {
  const headers = {
    "x-ai-provider": "openai",
    "x-ai-key": key,
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": model,
  };
  if (quota !== undefined) headers["x-ai-quota"] = quota;
  const response = await fetch("http://localhost:3000/api/ai/quota", {
    method: "GET",
    headers,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

// Fresh model names per run, since buckets live in the dev-server process.
const RUN = Date.now().toString(36);

// 1. Nothing spent yet: the counter starts empty but still reports the limit.
const fresh = await ask(`read-${RUN}`, { quota: "50/60" });
check(
  "fresh budget reports zeros against its limit",
  fresh.status === 200 &&
    fresh.body?.quota?.used === 0 &&
    fresh.body?.quota?.limit === 50 &&
    fresh.body?.quota?.remaining === 50,
  JSON.stringify(fresh.body),
);

// 2. The same bucket the generators spend from: one subgoal generation, then
//    the read shows exactly one request spent.
const generation = await fetch("http://localhost:3000/api/ai/subgoals", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": "sk-test",
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": `read-${RUN}`,
    "x-ai-quota": "50/60",
  },
  body: JSON.stringify({
    goal: { title: "Read the quota aloud", start_date: "2026-10-01", target_date: "2026-11-01" },
    existing: [],
  }),
});
await generation.text();
const after = await ask(`read-${RUN}`, { quota: "50/60" });
check(
  "a generation moves the same counter the read reports",
  after.status === 200 && after.body?.quota?.used === 1 && after.body?.quota?.remaining === 49,
  JSON.stringify(after.body),
);

// 3. No budget declared: no tracking at all.
const free = await ask(`read-${RUN}`);
check("no quota header means no counter", free.status === 200 && free.body?.quota === null, JSON.stringify(free.body));

// 4. Validation still applies to a read.
const noKey = await ask(`read-${RUN}`, { key: "" , quota: "50/60" });
check("missing key refuses the read", noKey.status === 400 && typeof noKey.body?.error === "string");

upstream.close();
process.exit(failures === 0 ? 0 : 1);
