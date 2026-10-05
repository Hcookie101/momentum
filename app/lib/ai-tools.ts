// Tools the chat model can call to read the user's live Momentum data, plus
// their execution against Supabase. Server-side only: the route injects its
// cookie-backed client, so this module never lands in the browser bundle and
// reads always run with the caller's own Supabase access.
//
// Momentum doesn't have a sign-in step yet — these tables are read with the
// publishable key by the dashboard and written by the browser extension — so
// the tools don't demand a session either: they read the same rows the Stats
// page shows. If RLS later restricts access, denied reads come back as
// `{ error }` and the model relays them.
//
// Results are plain JSON objects — they're stringified into the provider's
// tool-result message by app/lib/ai-providers.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatDay } from "@/app/lib/ai";
import { categoryFor, formatCompact, formatDuration } from "@/app/lib/stats";

export type AiToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  // Gemini 3 sends an opaque `thoughtSignature` with the first functionCall part
  // and rejects the next turn unless that part is sent back unchanged
  // ("Function call is missing a thought_signature in functionCall parts").
  signature?: string;
};

// One shared JSON Schema — OpenAI (`parameters`), Anthropic (`input_schema`)
// and Gemini (`parameters`) all accept this draft-07 style shape.
export type AiToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const DATE_PARAM = {
  type: "string",
  description: "Local calendar date as YYYY-MM-DD. Defaults to today.",
};

export const AI_TOOLS: AiToolDefinition[] = [
  {
    name: "get_focus_stats",
    description:
      "Read the user's focus-timer sessions for a day: session count, total focused " +
      "time, per-session start/end times and focus scores. Use for questions about " +
      "how much or when the user focused.",
    parameters: {
      type: "object",
      properties: { date: DATE_PARAM },
      required: [],
    },
  },
  {
    name: "get_browsing_stats",
    description:
      "Read the user's browsing time for a day: total time, top sites and time per " +
      "category (Work, Entertainment, Social, Shopping, Other). Use for questions " +
      "about where the user's online time went.",
    parameters: {
      type: "object",
      properties: {
        date: DATE_PARAM,
        limit: { type: "integer", description: "How many top sites to return (default 8)." },
      },
      required: [],
    },
  },
  {
    name: "get_goals",
    description:
      "Read the user's goals and subgoals: open goals with due dates and subgoal " +
      "progress, and anything completed on a given day.",
    parameters: {
      type: "object",
      properties: {
        date: DATE_PARAM,
        status: {
          type: "string",
          enum: ["open", "completed_today", "both"],
          description: "Which goals to return (default both).",
        },
        limit: { type: "integer", description: "Max goals per list (default 8)." },
      },
      required: [],
    },
  },
  {
    name: "get_schedule",
    description:
      "Read the user's schedule for a day: recurring obligations (classes, shifts, " +
      "gym…) and weekly calendar events falling on that weekday, with start and end " +
      "times.",
    parameters: {
      type: "object",
      properties: { date: DATE_PARAM },
      required: [],
    },
  },
];

// ---- tool implementations --------------------------------------------------

async function focusStats(
  args: Record<string, unknown>,
  day: ChatDay,
  supabase: SupabaseClient,
): Promise<unknown> {
  const { date, from, to } = resolveDay(args, day);
  const { data, error } = await supabase
    .from("focus_sessions")
    .select("start_time, end_time, focus_score")
    .gte("start_time", from)
    .lt("start_time", to)
    .order("start_time", { ascending: true });
  if (error) return { error: `Could not read focus sessions: ${error.message}` };

  const rows = data ?? [];
  const finished = rows.filter((row) => row.end_time);
  const seconds = finished.reduce(
    (total, row) => total + (Date.parse(row.end_time!) - Date.parse(row.start_time)) / 1000,
    0,
  );
  const rated = rows.filter((row) => row.focus_score !== null);
  const avg = rated.length
    ? rated.reduce((total, row) => total + (row.focus_score ?? 0), 0) / rated.length
    : null;
  const tzOffset = day.tzOffset ?? 0;

  return {
    date,
    sessions: rows.length,
    completed_sessions: finished.length,
    running_sessions: rows.length - finished.length,
    total_seconds: Math.round(seconds),
    total: formatDuration(seconds),
    average_focus_score: avg === null ? null : Math.round(avg * 10) / 10,
    // Times are "HH:MM" in the user's local time; scores are 0–10.
    session_details: finished.slice(0, 12).map((row) => ({
      start: wallClock(row.start_time, tzOffset),
      end: wallClock(row.end_time!, tzOffset),
      minutes: Math.round((Date.parse(row.end_time!) - Date.parse(row.start_time)) / 60_000),
      focus_score: row.focus_score,
    })),
  };
}

async function browsingStats(
  args: Record<string, unknown>,
  day: ChatDay,
  supabase: SupabaseClient,
): Promise<unknown> {
  const { date, from, to } = resolveDay(args, day);
  const limit = intArg(args, "limit", 8, 20);
  const { data, error } = await supabase
    .from("browsing_sessions")
    .select("domain, duration_seconds")
    .gte("visited_at", from)
    .lt("visited_at", to);
  if (error) return { error: `Could not read browsing sessions: ${error.message}` };

  const byDomain = new Map<string, number>();
  for (const row of data ?? []) {
    byDomain.set(row.domain, (byDomain.get(row.domain) ?? 0) + row.duration_seconds);
  }
  const sites = [...byDomain.entries()].sort((a, b) => b[1] - a[1]);
  const total = sites.reduce((sum, [, seconds]) => sum + seconds, 0);

  const byCategory = new Map<string, number>();
  for (const [domain, seconds] of sites) {
    const name = categoryFor(domain).name;
    byCategory.set(name, (byCategory.get(name) ?? 0) + seconds);
  }

  return {
    date,
    total_seconds: total,
    total: formatDuration(total),
    sites: sites.slice(0, limit).map(([domain, seconds]) => ({
      domain,
      seconds,
      duration: formatCompact(seconds),
      category: categoryFor(domain).name,
    })),
    time_by_category: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, seconds]) => ({ category, seconds, duration: formatCompact(seconds) })),
  };
}

// ---- helpers ---------------------------------------------------------------

type Window = { date: string; from: string; to: string };

// Window bounds for a date in the *user's* timezone: the browser sent its
// UTC offset along with today's window (getTimezoneOffset = UTC − local, in
// minutes), so any date can be converted without knowing the server's tz.
function resolveDay(args: Record<string, unknown>, day: ChatDay): Window {
  const requested =
    typeof args.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : day.date;
  if (requested === day.date) return { date: day.date, from: day.from, to: day.to };

  const [year, month, date] = requested.split("-").map(Number);
  const offset = day.tzOffset ?? 0;
  const base = Date.UTC(year, month - 1, date); // local midnight, read as if UTC
  const from = new Date(base + offset * 60_000);
  const to = new Date(base + offset * 60_000 + 24 * 3_600_000);
  return { date: requested, from: from.toISOString(), to: to.toISOString() };
}

// An ISO timestamp rendered as the user's wall-clock "HH:MM".
function wallClock(iso: string, tzOffset: number): string {
  const local = new Date(Date.parse(iso) - tzOffset * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

// 18.5 → "6:30 PM" (start_hour is a half-hour float on a 0–24 scale, the same
// convention the obligations and calendar pages use).
function clock(hour: number): string {
  const total = Math.round(hour * 60);
  const h24 = Math.floor(total / 60) % 24;
  const mins = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(mins).padStart(2, "0")} ${suffix}`;
}

// Weekday of a `YYYY-MM-DD` string (0 = Sunday … 6 = Saturday — the same
// index the calendar and obligations grids use), built from UTC components so
// the server's timezone can't shift the day.
function weekdayOf(date: string): number | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day || Number.isNaN(day)) return null;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function weekdayName(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

// Whole days between two `YYYY-MM-DD` strings (positive = still to come).
function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((Date.parse(fromDate) - Date.parse(toDate)) / 86_400_000);
}

function intArg(args: Record<string, unknown>, key: string, fallback: number, max: number): number {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), max);
}

async function goals(
  args: Record<string, unknown>,
  day: ChatDay,
  supabase: SupabaseClient,
): Promise<unknown> {
  const status =
    args.status === "open" || args.status === "completed_today" ? args.status : "both";
  const limit = intArg(args, "limit", 8, 25);
  const result: Record<string, unknown> = {};

  if (status !== "completed_today") {
    const { data, error } = await supabase
      .from("goals")
      .select("id, title, target_date")
      .eq("completed", false)
      .order("target_date", { ascending: true })
      .limit(limit);
    if (error) return { error: `Could not read goals: ${error.message}` };

    // One extra query for subgoal progress on the listed goals.
    const open = data ?? [];
    const progress = new Map<string, { completed: number; total: number }>();
    if (open.length > 0) {
      const { data: subs, error: subError } = await supabase
        .from("subgoals")
        .select("goal_id, completed")
        .in("goal_id", open.map((goal) => goal.id));
      if (!subError) {
        for (const sub of subs ?? []) {
          const entry = progress.get(sub.goal_id) ?? { completed: 0, total: 0 };
          entry.total += 1;
          if (sub.completed) entry.completed += 1;
          progress.set(sub.goal_id, entry);
        }
      }
      // A failed progress query only drops the counts — titles still show.
    }

    result.open = open.map((goal) => {
      const counts = progress.get(goal.id);
      return {
        title: goal.title,
        due: goal.target_date,
        days_until_due: daysBetween(goal.target_date, day.date),
        subgoals: counts ? { completed: counts.completed, total: counts.total } : undefined,
      };
    });
  }

  if (status !== "open") {
    const { from, to } = resolveDay(args, day);
    const [doneRes, doneSubRes] = await Promise.all([
      supabase
        .from("goals")
        .select("title, completed_at")
        .eq("completed", true)
        .gte("completed_at", from)
        .lt("completed_at", to),
      supabase
        .from("subgoals")
        .select("title, completed_at")
        .eq("completed", true)
        .gte("completed_at", from)
        .lt("completed_at", to),
    ]);
    if (doneRes.error || doneSubRes.error) {
      return {
        error: `Could not read completed goals: ${(doneRes.error ?? doneSubRes.error)!.message}`,
      };
    }
    result.completed_today = [
      ...(doneRes.data ?? []).map((row) => ({ title: row.title, kind: "goal" })),
      ...(doneSubRes.data ?? []).map((row) => ({ title: row.title, kind: "subgoal" })),
    ];
  }

  return result;
}

async function schedule(
  args: Record<string, unknown>,
  day: ChatDay,
  supabase: SupabaseClient,
): Promise<unknown> {
  const { date } = resolveDay(args, day);
  const weekday = weekdayOf(date);
  if (weekday === null) return { error: `Invalid date: ${date}` };

  const [oblRes, calRes] = await Promise.all([
    supabase.from("obligations").select("title, days, start_hour, duration"),
    supabase.from("calendar_events").select("title, day, start_hour, duration"),
  ]);
  if (oblRes.error || calRes.error) {
    return { error: `Could not read the schedule: ${(oblRes.error ?? calRes.error)!.message}` };
  }

  const timed = (rows: { title: string; start_hour: number; duration: number }[]) =>
    [...rows]
      .sort((a, b) => a.start_hour - b.start_hour)
      .map((row) => ({
        title: row.title,
        start: clock(row.start_hour),
        end: clock(row.start_hour + row.duration),
      }));

  return {
    date,
    weekday: weekdayName(date),
    // Recurring weekly obligations that fall on this weekday…
    obligations: timed((oblRes.data ?? []).filter((row) => row.days.includes(weekday))),
    // …and the weekly calendar events for it.
    calendar_events: timed((calRes.data ?? []).filter((row) => row.day === weekday)),
  };
}

// Runs one tool call. Never throws: failures come back as `{ error }` so the
// model can explain them instead of the whole chat dying. Reads run with the
// request's cookie-backed client — the same publishable-key access the Stats
// page and the extension use — so a table that denies access (RLS) surfaces as
// an error here rather than silently returning nothing.
export async function executeAiTool(
  call: AiToolCall,
  day: ChatDay,
  supabase: SupabaseClient,
): Promise<unknown> {
  try {
    switch (call.name) {
      case "get_focus_stats":
        return await focusStats(call.args, day, supabase);
      case "get_browsing_stats":
        return await browsingStats(call.args, day, supabase);
      case "get_goals":
        return await goals(call.args, day, supabase);
      case "get_schedule":
        return await schedule(call.args, day, supabase);
      default:
        return { error: `Unknown tool "${call.name}".` };
    }
  } catch (error) {
    return { error: `The tool failed: ${(error as Error).message}` };
  }
}

