// One-shot helper for the Goals page's "Generate" button: asks the configured
// provider to break one goal into 3–6 subgoals with start/target dates paced
// toward the goal's deadline, and returns them as JSON for the browser to
// review before anything is written to Supabase.
//
// Unlike the chat route this doesn't stream or call tools — it builds a
// single prompt from the goal the user picked, sends one non-streaming
// generation (app/lib/ai-once.ts handles the send and the free-tier quota
// pacing shared with /api/ai) and normalizes the JSON array the model replies
// with.

import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import { readProviderConfig } from "@/app/lib/ai-providers";
import { generateOnce, oneShotError, parseJsonArray } from "@/app/lib/ai-once";
import { toLocalDateString } from "@/app/lib/stats";

const SYSTEM_PROMPT =
  "You are the planning assistant built into Momentum, a personal focus and " +
  "productivity dashboard with goals and dated subgoals. You break a goal " +
  "into a short ordered list of subgoals whose start and target dates fit " +
  "inside the goal's own window and pace the work toward its deadline: the " +
  "earlier ones are foundations, the last one finishes right at the goal's " +
  "target date. Titles are concrete and actionable (a verb and an object), " +
  "not restatements of the goal. Reply with ONLY a JSON array — no prose, " +
  "no code fences — whose elements are " +
  '{"title": string, "start_date": "YYYY-MM-DD", "target_date": "YYYY-MM-DD"}.';

// At most this many subgoals are kept even if the model returns more.
const MAX_DRAFTS = 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Draft = { title: string; start_date: string; target_date: string };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

function clampDate(value: string, min: string, max: string): string {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}


export async function POST(request: Request) {
  // The middleware only gates page paths, so API routes check the session
  // themselves — before parsing provider config or reaching upstream.
  const {
    data: { user },
  } = await createClient(await cookies()).auth.getUser();
  if (!user) return jsonError("You're signed out — log back in and try again.", 401);

  const config = readProviderConfig(request);
  if (typeof config === "string") return jsonError(config, 400);

  let body: { goal?: Record<string, unknown>; existing?: unknown };
  try {
    body = (await request.json()) as { goal?: Record<string, unknown>; existing?: unknown };
  } catch {
    return jsonError("Expected a JSON body.", 400);
  }

  const goal = body.goal;
  const title = typeof goal?.title === "string" ? goal.title.trim() : "";
  const start = goal?.start_date;
  const target = goal?.target_date;
  if (!title) return jsonError("There is no goal to generate subgoals for.", 400);
  if (!isDate(start) || !isDate(target)) {
    return jsonError("The goal needs a valid start and target date.", 400);
  }
  if (target < start) return jsonError("The goal's target date is before its start date.", 400);

  // The window the plan may use: whatever is left of the goal. A goal that
  // already started (or is overdue) still gets a plan — the window just
  // shrinks to what remains, so a late sprint can be laid out instead of
  // being refused.
  const today = toLocalDateString(new Date());
  const windowStart = clampDate(today > start ? today : start, start, target);

  // Titles already under the goal: the model should extend the plan, not
  // repeat it.
  const existing = Array.isArray(body.existing)
    ? body.existing
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .slice(0, 40)
    : [];

  const prompt =
    `Today is ${today}.\n` +
    `Break this goal into 3 to 6 subgoals:\n` +
    `Goal: "${title}"\n` +
    `The goal runs from ${start} to ${target}.\n` +
    `Every subgoal must start on or after ${windowStart} and reach its ` +
    `target on or before ${target}; pace them in order so the last one ` +
    `lands on ${target}. Subgoals are sequential steps, not parallel ` +
    `checklists.\n` +
    (existing.length
      ? `These subgoals already exist — don't repeat or rephrase them:\n` +
        existing.map((item) => `- ${item}`).join("\n") +
        `\n`
      : "") +
    `Reply with ONLY the JSON array.`;

  const sent = await generateOnce(
    request,
    config,
    [{ role: "user", content: prompt }],
    SYSTEM_PROMPT,
  );
  if (!sent.ok) return oneShotError(sent);

  // Normalize what came back: keep usable entries only, pull dates inside the
  // goal's remaining window, drop titles that already exist, and order by the
  // deadline — the browser shows the result for review before inserting.
  const seen = new Set(existing.map((item) => item.toLowerCase()));
  const drafts: Draft[] = [];
  for (const item of parseJsonArray(sent.text) ?? []) {
    if (drafts.length >= MAX_DRAFTS) break;
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const draftTitle = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!draftTitle) continue;
    const key = draftTitle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const draftStart = isDate(raw.start_date)
      ? clampDate(raw.start_date, windowStart, target)
      : windowStart;
    const draftTarget = isDate(raw.target_date)
      ? clampDate(raw.target_date, draftStart, target)
      : target;
    drafts.push({ title: draftTitle, start_date: draftStart, target_date: draftTarget });
  }
  if (drafts.length === 0) {
    return jsonError("The model didn't return usable subgoals — try again.", 502);
  }
  drafts.sort((a, b) => a.target_date.localeCompare(b.target_date));

  return Response.json({
    subgoals: drafts,
    ...(sent.quota ? { quota: sent.quota } : {}),
  });
}
