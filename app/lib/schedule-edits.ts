// ---- schedule edits --------------------------------------------------------
// Server-side helpers for `propose_schedule_changes` / `apply_schedule_changes`
// (see app/lib/ai-tools.ts): the same validation every entry point uses, so a
// prompt-built plan, a tool call, and the stored approval can never disagree
// on what a legal edit looks like.
//
// `color` is absent on purpose: the browser (or the chat approval lane) owns
// the palette and assigns it when adding. Colors never touch later reviews.

import type { SupabaseClient } from "@supabase/supabase-js";

export const SCHEDULE_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MAX_SCHEDULE_TITLE = 100;

// At most this many proposals stay valid, each for this long — pending edits
// are approval scaffolding, not data, so they expire quickly and cheaply.
export const MAX_SCHEDULE_EDITS = 20;
const PROPOSAL_TTL_MS = 10 * 60_000;

export type ScheduleEditInput = Record<string, unknown>;

export type AppliedScheduleEdit =
  | { type: "add"; title: string; day: number; start_hour: number; duration: number }
  | { type: "remove"; id: string; title: string }
  | {
      type: "move";
      id: string;
      title: string;
      day: number;
      start_hour: number;
      duration: number;
    };

export type ScheduleProposalEdit = AppliedScheduleEdit & { index: number };

// Round to the calendar's half-hour grid; null when it isn't a number at all.
export function roundHalfHour(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 2) / 2;
}

function cleanTitle(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_SCHEDULE_TITLE) : "";
}


// Normalize one unknown entry into a safe edit, or null when it means
// nothing: empty titles, missing numbers and out-of-range days are dropped,
// times are snapped to the grid and clamped inside the day.
function normalizeEdit(raw: unknown): AppliedScheduleEdit | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const type = item.type === "remove" || item.type === "move" ? item.type : "add";

  if (type === "remove") {
    if (typeof item.id !== "string" || !item.id) return null;
    return { type, id: item.id, title: cleanTitle(item.title) || "calendar event" };
  }

  const title = cleanTitle(item.title);
  if (!title) return null;
  const day = roundHalfHour(item.day);
  if (day === null || day < 0 || day > 6) return null;
  const start = roundHalfHour(item.start_hour);
  if (start === null) return null;
  const startHour = Math.min(Math.max(0, start), 23.5);
  let duration = roundHalfHour(item.duration) ?? 1;
  duration = Math.min(Math.max(0.5, duration), 24 - startHour);

  if (type === "add") return { type, title, day, start_hour: startHour, duration };
  if (typeof item.id !== "string" || !item.id) return null;
  return { type, id: item.id, title, day, start_hour: startHour, duration };
}


// One day of everything that blocks new events: the obligation covering it
// plus the (kept) events already there — `placed` grows with every accepted
// draft so a batch can't overlap itself. Obligations are rules, not rows, and
// the calendar only ever moves its own events.
export function blocksOverlap(
  blocks: { day: number; start_hour: number; duration: number }[],
  day: number,
  startHour: number,
  duration: number,
): boolean {
  return blocks.some(
    (block) =>
      block.day === day &&
      block.start_hour < startHour + duration &&
      startHour < block.start_hour + block.duration,
  );
}

export type ValidatedScheduleBatch = {
  edits: ScheduleProposalEdit[];
  dropped: { index: number; reason: string }[];
};

// Shape every raw list into validated, non-overlapping edits: skips anything
// invalid, anything pointing at an event that no longer exists, duplicates of
// existing titles, and anything overlapping the stored blocks or an earlier
// accepted edit — reporting each rejection so the model can explain itself.
export function validateScheduleBatch(
  raw: unknown,
  blocks: { day: number; start_hour: number; duration: number }[],
  existingEvents: { id: string; title: string; day: number }[],
  existingTitles: Set<string>,
): ValidatedScheduleBatch {
  const edits: ScheduleProposalEdit[] = [];
  const dropped: { index: number; reason: string }[] = [];
  const takenTitles = new Set(existingTitles);
  const placed = [...blocks];
  const ids = new Set(existingEvents.map((event) => event.id));

  const list = Array.isArray(raw) ? raw : [];
  for (const [rawIndex, item] of list.entries()) {
    if (edits.length >= MAX_SCHEDULE_EDITS) {
      dropped.push({ index: rawIndex, reason: "more than the accepted batch size" });
      continue;
    }
    const edit = normalizeEdit(item);
    if (!edit) {
      dropped.push({ index: rawIndex, reason: "missing a usable title, time or day" });
      continue;
    }
    if (edit.type !== "add" && !ids.has(edit.id)) {
      dropped.push({ index: rawIndex, reason: `no event matches id ${JSON.stringify(edit.id)}` });
      continue;
    }
    if (edit.type === "add") {
      const key = `${edit.day}:${edit.title.toLowerCase()}`;
      if (takenTitles.has(key)) {
        dropped.push({
          index: rawIndex,
          reason: `a matching title already exists on ${SCHEDULE_DAYS[edit.day]}`,
        });
        continue;
      }
      takenTitles.add(key);
    }
    if (edit.type !== "remove" && blocksOverlap(placed, edit.day, edit.start_hour, edit.duration)) {
      dropped.push({ index: rawIndex, reason: "overlaps a busy block or an accepted edit" });
      continue;
    }
    if (edit.type !== "remove") {
      placed.push({ day: edit.day, start_hour: edit.start_hour, duration: edit.duration });
    }
    edits.push({ ...edit, index: rawIndex });
  }
  return { edits, dropped };
}

// Live rows for the approval lanes: obligations expanded into per-day blocks
// plus the calendar events themselves, each tagged so reviews can tell rows
// from rules. Shared by the schedule one-shot and the chat propose tool.
export async function scheduleBlocks(
  supabase: SupabaseClient,
): Promise<
  | {
      ok: true;
      blocks: { day: number; start_hour: number; duration: number }[];
      events: { id: string; title: string; day: number }[];
      titles: Set<string>;
    }
  | { ok: false; message: string }
> {
  const [oblRes, calRes] = await Promise.all([
    supabase.from("obligations").select("title, days, start_hour, duration"),
    supabase.from("calendar_events").select("id, title, day, start_hour, duration"),
  ]);
  const readError = oblRes.error ?? calRes.error;
  if (readError) return { ok: false, message: `Could not read the schedule: ${readError.message}` };

  const blocks: { day: number; start_hour: number; duration: number }[] = [];
  for (const row of (oblRes.data ?? []) as {
    title: string;
    days: number[];
    start_hour: number;
    duration: number;
  }[]) {
    for (const day of row.days ?? []) {
      if (typeof day === "number" && day >= 0 && day <= 6) {
        blocks.push({ day, start_hour: row.start_hour, duration: row.duration });
      }
    }
  }
  const events = (calRes.data ?? []) as {
    id: string;
    title: string;
    day: number;
    start_hour: number;
    duration: number;
  }[];
  for (const row of events) {
    if (typeof row.day === "number" && row.day >= 0 && row.day <= 6) {
      blocks.push({ day: row.day, start_hour: row.start_hour, duration: row.duration });
    }
  }
  const titles = new Set(
    events.map((event) => `${event.day}:${String(event.title ?? "").trim().toLowerCase()}`),
  );
  return {
    ok: true,
    blocks,
    events: events.map((event) => ({
      id: event.id,
      title: String(event.title ?? "").trim() || "calendar event",
      day: event.day,
    })),
    titles,
  };
}

// ---- approval store --------------------------------------------------------
// Everything the browser's approval card needs — including the snapshot of
// the proposed batch itself, which the apply lane re-checks so a stale
// approval can't write something new. Pending batches await one click, so
// they live in this process's memory (one map, tokens as keys, a TTL each)
// instead of a table. RLS scopes the writes per user (the apply route stamps
// the owner), and the write path re-validates the exact stored batch against
// live rows, so a forged or cross-user token only ever produces mismatches,
// never foreign writes.

export type ScheduleProposal = {
  token: string;
  summary: string;
  edits: ScheduleProposalEdit[];
  events: { id: string; title: string; day: number }[];
  expiresAt: number;
};

const proposals = new Map<string, ScheduleProposal>();

function sweepProposals(): void {
  const now = Date.now();
  for (const [token, stored] of proposals) {
    if (stored.expiresAt <= now) proposals.delete(token);
  }
}

export function storeScheduleProposal(
  summary: string,
  validated: ScheduleProposalEdit[],
  events: { id: string; title: string; day: number }[],
): ScheduleProposal {
  sweepProposals();
  const stored: ScheduleProposal = {
    token: crypto.randomUUID(),
    summary,
    edits: validated,
    events,
    expiresAt: Date.now() + PROPOSAL_TTL_MS,
  };
  proposals.set(stored.token, stored);
  return stored;
}

export function takeScheduleProposal(token: unknown): ScheduleProposal | null {
  if (typeof token !== "string" || !token) return null;
  sweepProposals();
  const stored = proposals.get(token) ?? null;
  if (stored) proposals.delete(token);
  return stored;
}

// The chat lane's executor lives in app/lib/ai-tools.ts and calls this:
// validate the model's batch, store the usable edits under a single-use
// approval token, and hand the browser exactly what its card needs — never
// the storage details (no `events` snapshot, no expiry timestamp, none of
// which the model or the UI should see).
export async function executeScheduleProposal(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<unknown> {
  const blocks = await scheduleBlocks(supabase);
  if (!blocks.ok) return { error: blocks.message };

  const summary =
    typeof args.summary === "string" && args.summary.trim()
      ? args.summary.trim().slice(0, 280)
      : "Schedule changes";
  const validated = validateScheduleBatch(
    args.edits,
    blocks.blocks,
    blocks.events,
    blocks.titles,
  );
  if (validated.edits.length === 0) {
    const hint = validated.dropped[0]?.reason ?? "nothing usable was proposed";
    return { error: `No usable edits — ${hint}.` };
  }

  const stored = storeScheduleProposal(summary, validated.edits, blocks.events);
  return {
    proposal: {
      token: stored.token,
      summary: stored.summary,
      // `index` points back into the stored batch so the browser's card can
      // say exactly which edits the user approved. The route strips this
      // payload before handing the model its result — the token and indices
      // never reach the model, only the browser.
      edits: stored.edits.map(({ index, ...edit }) => ({ ...edit, index })),
      dropped: validated.dropped,
    },
  };
}

