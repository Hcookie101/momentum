// One-shot helper for the Schedule page's "Generate schedule" button: reads
// the user's busy blocks (recurring obligations and weekly calendar events)
// and open goals server-side — the same cookie-backed Supabase access the
// chat route's tools use — asks the model to lay the plan out across the
// free time of the week, and returns the events as JSON for the browser to
// review before anything is written to Supabase.
//
// The send itself (plus the free-tier quota pacing shared with /api/ai) lives
// in app/lib/ai-once.ts; this route is prompt in, normalized events out.

import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import { readProviderConfig } from "@/app/lib/ai-providers";
import { generateOnce, oneShotError, parseJsonArray } from "@/app/lib/ai-once";

const SYSTEM_PROMPT =
  "You are the planning assistant built into Momentum, a personal focus and " +
  "productivity dashboard with a weekly calendar, recurring obligations and " +
  "dated goals. You lay out a realistic week: you never schedule over the " +
  "busy blocks you are given, you leave breathing room instead of filling " +
  "every free hour, and you place focus blocks for the goals where the user " +
  "is most likely to have energy (mornings for demanding work). Titles are " +
  "short and concrete. Reply with ONLY a JSON array — no prose, no code " +
  "fences — whose elements are " +
  '{"title": string, "day": 0-6 (0=Sunday), "start_hour": number ' +
  "(0-23 in half-hour steps), \"duration\": number (0.5-4, half-hour steps)}.";

// At most this many events are kept even if the model returns more.
const MAX_EVENTS = 30;
const MAX_TITLE = 100;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Busy = { title: string; day: number; start_hour: number; duration: number };
type Draft = { title: string; day: number; start_hour: number; duration: number };
type Obligation = { title: string; days: number[]; start_hour: number; duration: number };
type Goal = { title: string; target_date: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

// The calendar's own clock labels ("9:30 AM"), for the prompt.
function clock(hour: number): string {
  if (hour >= 24) return "12 AM";
  const mins = hour % 1 === 0.5 ? ":30" : "";
  const whole = Math.floor(hour);
  const h = whole % 12 === 0 ? 12 : whole % 12;
  return `${h}${mins} ${whole >= 12 ? "PM" : "AM"}`;
}

// Round to the calendar's half-hour grid; null when it isn't a number at all.
function roundHalf(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 2) / 2;
}

function overlaps(a: Busy, b: { start_hour: number; duration: number }): boolean {
  return a.start_hour < b.start_hour + b.duration && b.start_hour < a.start_hour + a.duration;
}

export async function POST(request: Request) {
  // The middleware only gates page paths, so API routes check the session
  // themselves — before parsing provider config or reaching upstream.
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("You're signed out — log back in and try again.", 401);

  const config = readProviderConfig(request);
  if (typeof config === "string") return jsonError(config, 400);

  // An optional note from the user ("finish the essay before Sunday") rides
  // along with the request; anything else in the body is ignored.
  let body: { note?: unknown };
  try {
    body = (await request.json()) as { note?: unknown };
  } catch {
    body = {};
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";

  // The busy blocks and goals come from the database, not the browser: the
  // calendar page doesn't have obligations loaded, and reading here keeps
  // the request body empty and the prompt honest. (`supabase` is the
  // cookie-backed client resolved above, once the session was verified.)
  const [oblRes, calRes, goalRes] = await Promise.all([
    supabase.from("obligations").select("title, days, start_hour, duration"),
    supabase.from("calendar_events").select("title, day, start_hour, duration"),
    supabase
      .from("goals")
      .select("title, target_date")
      .eq("completed", false)
      .order("target_date"),
  ]);
  const readError = oblRes.error ?? calRes.error ?? goalRes.error;
  if (readError) return jsonError(`Could not read the schedule: ${readError.message}`, 500);

  const obligations = (oblRes.data ?? []) as Obligation[];
  const events = (calRes.data ?? []) as Pick<Busy, "title" | "day" | "start_hour" | "duration">[];
  const goals = (goalRes.data ?? []) as Goal[];

  // Every busy block per weekday (obligations repeat on each of their days;
  // calendar events already are weekly), sorted for a readable prompt.
  const busyByDay: Busy[][] = Array.from({ length: 7 }, () => []);
  for (const row of obligations) {
    for (const day of row.days) {
      if (day >= 0 && day <= 6) {
        busyByDay[day].push({
          title: row.title,
          day,
          start_hour: row.start_hour,
          duration: row.duration,
        });
      }
    }
  }
  for (const row of events) {
    if (row.day >= 0 && row.day <= 6) busyByDay[row.day].push(row);
  }
  const busyLines = busyByDay.map((blocks, day) => {
    if (blocks.length === 0) return `${DAY_NAMES[day]}: free`;
    const labels = [...blocks]
      .sort((a, b) => a.start_hour - b.start_hour)
      .map(
        (block) =>
          `${clock(block.start_hour)}–${clock(block.start_hour + block.duration)} ${block.title}`,
      )
      .join("; ");
    return `${DAY_NAMES[day]}: ${labels}`;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const goalLines = goals.slice(0, 20).map((goal) => {
    const daysLeft = Math.round((Date.parse(goal.target_date) - today.getTime()) / 86_400_000);
    return `- "${goal.title}" — due ${goal.target_date} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`;
  });

  const prompt =
    `Today is ${DAY_NAMES[new Date().getDay()]}. Lay out this week's calendar ` +
    `(${DAY_NAMES.join(", ")} — Sunday first).\n` +
    `Busy blocks already on the schedule (never overlap these):\n` +
    busyLines.map((line) => `- ${line}`).join("\n") +
    `\n` +
    (goalLines.length
      ? `Open goals worth scheduling focus time for:\n${goalLines.join("\n")}\n`
      : "") +
    (note ? `The user specifically asked for: ${note}\n Honor it within the free time.\n` : "") +
    `Add calendar events that fill the free time usefully: 1–4 hour focus ` +
    `blocks aimed at the goals above, plus meals, exercise and wind-down ` +
    `where they're missing. Keep evenings light, don't start before 6 AM or ` +
    `run past 11 PM, don't schedule the same title twice on one day, and ` +
    `leave some free hours open. Reply with ONLY the JSON array.`;

  const sent = await generateOnce(
    request,
    config,
    [{ role: "user", content: prompt }],
    SYSTEM_PROMPT,
  );
  if (!sent.ok) return oneShotError(sent);

  // Normalize what came back: snap to the half-hour grid, pull times inside
  // the day, drop duplicates and anything that overlaps the busy blocks or a
  // kept draft — the browser shows the result for review before inserting.
  const drafts: Draft[] = [];
  const takenTitles = new Set(
    events.map((event) => `${event.day}:${event.title.trim().toLowerCase()}`),
  );
  const placed: Busy[] = busyByDay.flat();
  for (const item of parseJsonArray(sent.text) ?? []) {
    if (drafts.length >= MAX_EVENTS) break;
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const draftTitle =
      typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE) : "";
    if (!draftTitle) continue;
    const day = roundHalf(raw.day);
    if (day === null || day < 0 || day > 6) continue;
    const start = roundHalf(raw.start_hour);
    if (start === null) continue;
    const startHour = Math.min(Math.max(0, start), 23.5);
    let duration = roundHalf(raw.duration) ?? 1;
    duration = Math.min(Math.max(0.5, duration), 24 - startHour);
    const draft: Draft = { title: draftTitle, day, start_hour: startHour, duration };

    const titleKey = `${day}:${draftTitle.toLowerCase()}`;
    if (takenTitles.has(titleKey)) continue;
    if (placed.some((block) => block.day === day && overlaps(block, draft))) continue;
    takenTitles.add(titleKey);
    placed.push(draft);
    drafts.push(draft);
  }
  if (drafts.length === 0) {
    return jsonError("The model didn't return usable calendar events — try again.", 502);
  }
  drafts.sort((a, b) => a.day - b.day || a.start_hour - b.start_hour);

  return Response.json({
    events: drafts,
    ...(sent.quota ? { quota: sent.quota } : {}),
  });
}
