// TEMPORARY diagnostic (safe to delete): the Schedule page's one-shot helper
// /api/ai/schedule — busy-block overlap dropping, half-hour snapping, clamps,
// duplicate/invalid-entry filtering, fenced JSON tolerance, validation errors.
// The route reads the real (read-only) obligations/events/goals from Supabase
// to build its prompt, so the mock provider echoes events derived from that
// prompt plus deliberately malformed ones.
//   $ node scripts/tmp-schedule-route.mjs   (needs the dev server on :3000)
import http from "node:http";

const PORT = 8796;
const DAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// Filled by the mock handler: the free slots it chose inside the user's week.
let slots = [];
// Whether the mock saw the user's optional note inside the prompt.
let sawNote = false;

function parseClock(label) {
  const match = /^(\d{1,2})(:30)? (AM|PM)$/.exec(label);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3] === "PM") hour += 12;
  return hour + (match[2] ? 0.5 : 0);
}

const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    // The user message carries the week's busy blocks (messages[0] is the
    // system prompt).
    const prompt = String(
      (body.messages ?? []).find((m) => m?.role === "user")?.content ?? "",
    );
    sawNote = prompt.includes("pizza night");

    // Read the route's own prompt back: the first busy block it listed
    // ("- Mon: 4:00 PM–5:30 PM …") so the mock can schedule straight over it,
    // and free hours so the "should survive" entries land somewhere the real
    // schedule allows. That keeps the test valid against any real data.
    const busy = /- (\w{3}): (\d{1,2}(?::30)? [AP]M)[–-]/.exec(prompt);
    const collision =
      busy && DAY_INDEX[busy[1]] !== undefined && parseClock(busy[2]) !== null
        ? {
            title: "Busy collision",
            day: DAY_INDEX[busy[1]],
            start_hour: parseClock(busy[2]),
            duration: 1,
          }
        : null;

    const busyForDay = (dayName) => {
      const line = new RegExp(`- ${dayName}: (.+)`).exec(prompt);
      if (!line || line[1].trim() === "free") return [];
      return [...line[1].matchAll(/(\d{1,2}(?::30)? [AP]M)[–-](\d{1,2}(?::30)? [AP]M)/g)].map(
        (m) => [parseClock(m[1]), parseClock(m[2])],
      );
    };
    // Two free two-hour slots, earliest first (the first start is nudged off
    // the hour so it also exercises the half-hour snap).
    slots = [];
    outer: for (const dayName of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const blocks = busyForDay(dayName);
      for (let start = 6; start <= 20; start += 0.5) {
        if (blocks.every(([s, e]) => start + 2 <= s || start >= e)) {
          slots.push({ day: DAY_INDEX[dayName], start: start + (slots.length === 0 ? 0.25 : 0) });
          if (slots.length === 2) break outer;
          start += 1; // next free slot, no overlap with the one just taken
        }
      }
    }

    const plan = [
      ...(slots[0]
        ? [
            { title: "Duplicate block", day: slots[0].day, start_hour: slots[0].start, duration: 1 },
            { title: "Duplicate block", day: slots[0].day, start_hour: slots[0].start, duration: 1 },
          ]
        : []),
      ...(slots[1] ? [{ title: "Test focus", day: slots[1].day, start_hour: slots[1].start, duration: 2 }] : []),
      { title: "", day: 1, start_hour: 12, duration: 1 },
      { title: "Bad day", day: 9, start_hour: 10, duration: 1 },
      { title: "Night owl", day: 2, start_hour: 25, duration: 2 },
      { title: "Long haul", day: 3, start_hour: 22, duration: 10 },
      ...(collision ? [collision] : []),
    ];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(plan) + "\n```" } }],
      }),
    );
  });
});
await new Promise((resolve) => upstream.listen(PORT, "127.0.0.1", resolve));

async function ask({ key = "sk-test", note = "", quota, model = "schedule-mock" } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": key,
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": model,
  };
  if (quota !== undefined) headers["x-ai-quota"] = quota;
  const response = await fetch("http://localhost:3000/api/ai/schedule", {
    method: "POST",
    headers,
    body: JSON.stringify({ note }),
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

// Free-tier quota: usage rides back with the events, counts every upstream
// send, and the daily cap refuses before anything is spent — with the
// counter attached for the badge. Fresh model names per run, since buckets
// live in the dev-server process.
const QUOTA_RUN = Date.now().toString(36);
const counted = await ask({
  note: "plan a pizza night on Saturday",
  quota: "50/60",
  model: `quota-${QUOTA_RUN}`,
});
check("plan replies 200", counted.status === 200, JSON.stringify(counted.body));
check(
  "quota usage rides back with the events",
  counted.body?.quota?.used === 1 &&
    counted.body?.quota?.limit === 50 &&
    counted.body?.quota?.remaining === 49,
  JSON.stringify(counted.body),
);
check("the user's note reaches the prompt", sawNote);
const { body } = counted;
const events = body?.events ?? [];
const byTitle = (title) => events.find((e) => e.title === title);

check(
  "events placed into real free time survive",
  Boolean(slots[1] && byTitle("Test focus")) && Boolean(slots[0] && byTitle("Duplicate block")),
  JSON.stringify({ slots, events }),
);
check(
  "start snapped to the half-hour grid",
  Boolean(slots[0]) && byTitle("Duplicate block")?.start_hour === Math.round(slots[0].start * 2) / 2,
  JSON.stringify(byTitle("Duplicate block")),
);
check("empty title dropped", !byTitle(""));
check("out-of-range day dropped", !byTitle("Bad day"));
check(
  "impossible start clamped to the end of the day",
  byTitle("Night owl")?.start_hour === 23.5 && byTitle("Night owl")?.duration === 0.5,
  JSON.stringify(byTitle("Night owl")),
);
check(
  "oversized duration clamped to the day's end",
  byTitle("Long haul")?.duration === 2,
  JSON.stringify(byTitle("Long haul")),
);
check(
  "same title kept only once per day",
  events.filter((e) => e.title === "Duplicate block").length === 1,
);
check("overlapping a busy block is dropped", !byTitle("Busy collision"));
check(
  "sorted by day then start",
  events.every(
    (e, i) =>
      i === 0 ||
      events[i - 1].day < e.day ||
      (events[i - 1].day === e.day && events[i - 1].start_hour <= e.start_hour),
  ),
);
check(
  "every event inside the day",
  events.every((e) => e.start_hour >= 0 && e.start_hour + e.duration <= 24),
);

const noKey = await ask({ key: "" });
check("missing key is a 400 with a hint", noKey.status === 400, JSON.stringify(noKey.body));

const countedAgain = await ask({ quota: "50/60", model: `quota-${QUOTA_RUN}` });
check(
  "a second generation spends a second request",
  countedAgain.status === 200 && countedAgain.body?.quota?.used === 2,
  JSON.stringify(countedAgain.body),
);
const first = await ask({ quota: "1/600", model: `cap-${QUOTA_RUN}` });
check(
  "first request inside a 1/day budget succeeds",
  first.status === 200 && first.body?.quota?.used === 1,
  JSON.stringify(first.body),
);
const refused = await ask({ quota: "1/600", model: `cap-${QUOTA_RUN}` });
check(
  "daily cap refuses without spending",
  refused.status === 429 && refused.body?.quota?.used === 1 && refused.body?.quota?.limit === 1,
  JSON.stringify(refused.body),
);
const free = await ask({ model: `quota-${QUOTA_RUN}` });
check("no quota header means no quota tracking", free.status === 200 && !("quota" in (free.body ?? {})));

upstream.close();
process.exit(failures === 0 ? 0 : 1);
