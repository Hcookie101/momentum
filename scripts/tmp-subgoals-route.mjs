// TEMPORARY diagnostic (safe to delete): the Goals page's one-shot helper
// /api/ai/subgoals — date clamping into the goal's remaining window, dedupe
// against existing subgoals, fenced/prose-wrapped JSON tolerance, validation
// errors, and 429 retry.
//   $ node scripts/tmp-subgoals-route.mjs   (needs the dev server on :3000)
import http from "node:http";

const PORT = 8795;

// OpenAI-shaped mock. Reply shape is chosen by model name.
let calls = 0;
const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const model = String(body.model ?? "");
    calls++;

    if (model === "always-429") {
      res.writeHead(429, { "Content-Type": "application/json", "retry-after": "1" });
      res.end(JSON.stringify({ error: { message: "Rate limit, be patient" } }));
      return;
    }
    if (model === "one-429" && calls === 1) {
      res.writeHead(429, { "Content-Type": "application/json", "retry-after": "1" });
      res.end(JSON.stringify({ error: { message: "Rate limit once" } }));
      return;
    }

    const plan = [
      { title: "Research schools", start_date: "2020-01-01", target_date: "2030-12-31" },
      { title: "Draft the essay", start_date: "2026-10-09", target_date: "2026-10-20" },
      // Duplicate of an existing subgoal — must be dropped.
      { title: "pick a topic", start_date: "2026-10-10", target_date: "2026-10-15" },
      { title: "", start_date: "2026-10-10", target_date: "2026-10-15" },
      { title: "Final polish", start_date: "2026-10-21", target_date: "2026-11-05" },
    ];
    let content;
    if (model === "fenced") content = "```json\n" + JSON.stringify(plan) + "\n```";
    else if (model === "prose")
      content = "Here you go!\n" + JSON.stringify(plan) + "\nHope that helps.";
    else content = JSON.stringify(plan);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    );
  });
});
await new Promise((resolve) => upstream.listen(PORT, "127.0.0.1", resolve));

async function ask(model, { goal, existing, key = "sk-test", quota } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": key,
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": model,
  };
  if (quota !== undefined) headers["x-ai-quota"] = quota;
  const response = await fetch("http://localhost:3000/api/ai/subgoals", {
    method: "POST",
    headers,
    body: JSON.stringify({
      goal: goal ?? {
        title: "Write the common app essay",
        start_date: "2026-10-01",
        target_date: "2026-11-01",
      },
      existing: existing ?? ["Pick a topic"],
    }),
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

// The route clamps to "today" in the server's local time — compute it here so
// the expectations don't rot as the day rolls over.
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
  now.getDate(),
).padStart(2, "0")}`;

// 1. Plain JSON: bad dates clamped into the window, empty/duplicate titles
//    dropped, result sorted by target date.
const plain = await ask(`plain-${Date.now().toString(36)}`);
check("plain array replies 200", plain.status === 200, JSON.stringify(plain.body));
const titles = (plain.body?.subgoals ?? []).map((s) => s.title);
check(
  "empty and duplicate titles dropped",
  JSON.stringify(titles) === JSON.stringify(["Draft the essay", "Research schools", "Final polish"]),
  JSON.stringify(titles),
);
const research = plain.body?.subgoals?.find((s) => s.title === "Research schools");
check(
  "out-of-window dates clamped into the goal window",
  research?.start_date === TODAY && research?.target_date === "2026-11-01",
  JSON.stringify(research),
);
const targets = (plain.body?.subgoals ?? []).map((s) => s.target_date);
check(
  "sorted by target date",
  JSON.stringify(targets) === JSON.stringify([...targets].sort()),
  JSON.stringify(targets),
);
check(
  "every target within the goal's deadline",
  targets.every((t) => t <= "2026-11-01"),
  JSON.stringify(targets),
);

// 2. Fenced and prose-wrapped replies still parse.
const fenced = await ask("fenced");
check("fenced ```json reply parses", fenced.status === 200 && fenced.body?.subgoals?.length === 3);
const prose = await ask("prose");
check("prose-wrapped reply parses", prose.status === 200 && prose.body?.subgoals?.length === 3);

// 3. A goal that already started: window starts today, not in the past.
const late = await ask("plain", {
  goal: { title: "Learn piano", start_date: "2026-09-01", target_date: "2026-12-01" },
  existing: [],
});
const lateStarts = (late.body?.subgoals ?? []).map((s) => s.start_date);
check(
  "started goal: no subgoal starts before today",
  lateStarts.every((s) => s >= TODAY),
  JSON.stringify(lateStarts),
);

// 4. Validation errors.
const noKey = await ask("plain", { key: "" });
check("missing key is a 400 with a hint", noKey.status === 400, JSON.stringify(noKey.body));
const noGoal = await ask("plain", { goal: {} });
check("missing goal is a 400", noGoal.status === 400, JSON.stringify(noGoal.body));
const badDates = await ask("plain", {
  goal: { title: "x", start_date: "soon", target_date: "2026-11-01" },
});
check("invalid dates are a 400", badDates.status === 400, JSON.stringify(badDates.body));

// 5. 429 handling: one retry salvages a blip, a wall of them surfaces a 429.
calls = 0;
const retried = await ask("one-429");
check("a single 429 is retried transparently", retried.status === 200 && calls === 2);
const wall = await ask("always-429");
check("persistent 429 surfaces as a 429 error", wall.status === 429, JSON.stringify(wall.body));

// 6. Free-tier quota: usage rides back with the answer, counts every upstream
//    send, and the daily cap refuses before anything is spent — with the
//    counter attached for the badge. Fresh model names per run, since buckets
//    live in the dev-server process.
const QUOTA_RUN = Date.now().toString(36);
const counted = await ask(`quota-${QUOTA_RUN}`, { quota: "50/60" });
check(
  "quota usage rides back with the drafts",
  counted.status === 200 &&
    counted.body?.quota?.used === 1 &&
    counted.body?.quota?.limit === 50 &&
    counted.body?.quota?.remaining === 49,
  JSON.stringify(counted.body),
);
const countedAgain = await ask(`quota-${QUOTA_RUN}`, { quota: "50/60" });
check(
  "a second generation spends a second request",
  countedAgain.status === 200 && countedAgain.body?.quota?.used === 2,
  JSON.stringify(countedAgain.body),
);
const first = await ask(`cap-${QUOTA_RUN}`, { quota: "1/600" });
check(
  "first request inside a 1/day budget succeeds",
  first.status === 200 && first.body?.quota?.used === 1,
  JSON.stringify(first.body),
);
const refused = await ask(`cap-${QUOTA_RUN}`, { quota: "1/600" });
check(
  "daily cap refuses without spending",
  refused.status === 429 && refused.body?.quota?.used === 1 && refused.body?.quota?.limit === 1,
  JSON.stringify(refused.body),
);
const free = await ask(`quota-${QUOTA_RUN}`);
check("no quota header means no quota tracking", free.status === 200 && !("quota" in (free.body ?? {})));

upstream.close();
process.exit(failures === 0 ? 0 : 1);
