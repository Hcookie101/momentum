// Applies a user-approved batch of calendar changes: the browser posts the
// card's token plus the exact per-edit decisions (which edits the user kept).
// The stored batch is single-use and re-validated against live rows, so a
// stale or forged approval only produces mismatches — never blind writes.
// No AI request happens here and no quota is spent: the unguessable,
// single-use, short-lived token *is* the authorization — it only ever
// exists in this server's memory and in the one SSE event that handed it to
// the user's own browser. Colors are assigned here, rotating the calendar's
// own palette in the same order events would render.

import { cookies } from "next/headers";
import { createClient } from "@/supabase/server";
import {
  blocksOverlap,
  scheduleBlocks,
  SCHEDULE_DAYS,
  takeScheduleProposal,
} from "@/app/lib/schedule-edits";

const EVENT_SWATCHES = ["#7CA9BD", "#F5E573", "#D26390"];
const MAX_TITLE = 100;

type Body = { token?: unknown; approvals?: unknown };

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const approvals = Array.isArray(body.approvals)
    ? body.approvals.filter((index): index is number => typeof index === "number")
    : [];
  if (approvals.length === 0) return jsonError("Nothing was approved to apply.", 400);

  // Single-use: the stored batch is consumed even when the apply runs into a
  // mismatch halfway through — replaying an approval must never double-apply.
  const stored = takeScheduleProposal(body.token);
  if (!stored) {
    return jsonError("That approval expired or was already used — ask the assistant again.", 410);
  }

  const supabase = createClient(await cookies());
  const blocks = await scheduleBlocks(supabase);
  if (!blocks.ok) return jsonError(blocks.message, 500);

  const byIndex = new Map(stored.edits.map((edit) => [edit.index, edit]));
  const placed = blocks.blocks.map((block) => ({ ...block }));
  const titles = new Set(blocks.titles);

  let added = 0;
  let moved = 0;
  let removed = 0;
  const skipped: { title: string; reason: string }[] = [];

  for (const index of approvals) {
    const edit = byIndex.get(index);
    if (!edit) {
      skipped.push({ title: "an unrecognized change", reason: "it was never part of this approval" });
      continue;
    }
    if (edit.type === "remove") {
      const { error } = await supabase.from("calendar_events").delete().eq("id", edit.id);
      if (error) {
        skipped.push({ title: edit.title, reason: error.message });
      } else {
        removed += 1;
        // Free the title so the slot could be re-proposed later. The block
        // itself stays in `placed` on purpose: the snapshot doesn't carry the
        // row's start/end, and keeping it is the conservative direction — a
        // later add overlapping that time is skipped (with a reason) rather
        // than allowed to double-book a slot we can no longer identify.
        const freed = stored.events.find((event) => event.id === edit.id);
        if (freed) titles.delete(`${freed.day}:${freed.title.trim().toLowerCase()}`);
      }
      continue;
    }

    // Adds and moves both land on a validated slot — snap and clamp here the
    // same way the validation did, then refuse overlaps against everything
    // accepted so far (plus obligations and untouched rows).
    const startHour = Math.min(Math.max(0, edit.start_hour), 23.5);
    const duration = Math.min(Math.max(0.5, edit.duration), 24 - startHour);
    if (blocksOverlap(placed, edit.day, startHour, duration)) {
      skipped.push({ title: edit.title, reason: "something now occupies that time" });
      continue;
    }

    if (edit.type === "add") {
      const titleKey = `${edit.day}:${edit.title.trim().toLowerCase()}`;
      if (titles.has(titleKey)) {
        skipped.push({ title: edit.title, reason: `already on ${SCHEDULE_DAYS[edit.day]}` });
        continue;
      }
      const { error } = await supabase.from("calendar_events").insert({
        title: edit.title.trim().slice(0, MAX_TITLE),
        day: edit.day,
        start_hour: startHour,
        duration,
        color: EVENT_SWATCHES[added % EVENT_SWATCHES.length],
      });
      if (error) {
        skipped.push({ title: edit.title, reason: error.message });
      } else {
        added += 1;
        placed.push({ day: edit.day, start_hour: startHour, duration });
        titles.add(titleKey);
      }
      continue;
    }

    const { error } = await supabase
      .from("calendar_events")
      .update({
        title: edit.title.trim().slice(0, MAX_TITLE),
        day: edit.day,
        start_hour: startHour,
        duration,
      })
      .eq("id", edit.id);
    if (error) {
      skipped.push({ title: edit.title, reason: error.message });
    } else {
      moved += 1;
      placed.push({ day: edit.day, start_hour: startHour, duration });
    }
  }

  const parts = [
    added ? `${added} added` : "",
    moved ? `${moved} moved` : "",
    removed ? `${removed} removed` : "",
  ].filter(Boolean);
  return Response.json({
    applied: { added, moved, removed },
    skipped,
    message: parts.length
      ? `Done: ${parts.join(", ")}.`
      : "Nothing was applied — everything approved had changed meanwhile.",
  });
}
