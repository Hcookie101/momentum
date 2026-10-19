"use client";
import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { Tables } from "@/supabase/types";
import { createClient } from "@/supabase/client";
import AiSettingsDialog from "@/app/ui/ai-settings";
import QuotaBadge from "@/app/ui/quota-badge";
import {
  type AiRequestError,
  generateSchedule,
  isAiConfigured,
  type CalendarPreviewDraft,
  type GeneratedEvent,
  type QuotaUsage,
  readAiSettings,
  readCalendarPreview,
  readQuotaUsage,
  setCalendarPreview,
  subscribeAiSettings,
  subscribeCalendarChanges,
  subscribeCalendarPreview,
} from "@/app/lib/ai";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);
const startTimes = Array.from({ length: 48 }, (_, i) => i / 2);

type CalendarEvent = Tables<"calendar_events">;

function fmt(hour: number) {
  if (hour >= 24) return "12 AM";
  const mins = hour % 1 === 0.5 ? ":30" : "";
  const h = Math.floor(hour);
  if (h === 0) return `12${mins} AM`;
  if (h < 12) return `${h}${mins} AM`;
  if (h === 12) return `12${mins} PM`;
  return `${h - 12}${mins} PM`;
}

function rangeLabel(start: number, duration: number) {
  return `${fmt(start)} – ${fmt(start + duration)}`;
}

function durationLabel(duration: number) {
  return duration === 0.5
    ? "30 min"
    : `${duration} hour${duration > 1 ? "s" : ""}`;
}

const EVENT_SWATCHES = ["#7CA9BD", "#F5E573", "#D26390"];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// SSR has no localStorage — the settings snapshot resolves on the client
// (same trick as the chat panel and focus timer).
const getServerSnapshot = () => null;

export default function Calendar() {
  const [supabase] = useState(() => createClient());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    hour: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [color, setColor] = useState("#7CA9BD");
  const [formDay, setFormDay] = useState(0);
  const [formHour, setFormHour] = useState(0);

  // AI schedule generation: the saved connection, the request in flight, its
  // error, and the drafts awaiting review.
  const settings = useSyncExternalStore(
    subscribeAiSettings,
    readAiSettings,
    getServerSnapshot,
  );
  // Ghosts from the approval flows (chat proposal card, this modal's review
  // list): staged adds render as dashed blocks, events about to be
  // removed/moved fade out. Null the moment no review is open. The modal's
  // own list would double-count its drafts against the grid, so reviews are
  // cleared explicitly at every exit point of the two dialogs below.
  const preview = useSyncExternalStore(
    subscribeCalendarPreview,
    readCalendarPreview,
    getServerSnapshot,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<GeneratedEvent[] | null>(null);
  // Phones show one day column; the tabs below switch it. Defaults to today.
  const [phoneDay, setPhoneDay] = useState(() => new Date().getDay());
  // Free-tier counter the route sends back (null when the connection doesn't
  // declare a quota): the same per-model bucket the chat panel shows.
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  // The pre-generation dialog: an optional note about what to plan for.
  const [composeOpen, setComposeOpen] = useState(false);
  const [note, setNote] = useState("");

  // A new connection can carry a different budget, so drop the counter when
  // the settings are written — the callback runs from the store's
  // subscription, never synchronously in an effect.
  useEffect(() => subscribeAiSettings(() => setQuota(null)), []);

  // The "now" indicator: appears right after mount (SSR renders no clock
  // time — same hydration trick as the settings snapshot), then ticks every
  // 30s so the line creeps with real time. Scrolls itself into view on open:
  // the grid is ~1920px tall, so landing at midnight would show nothing of
  // the actual day.
  const [now, setNow] = useState<Date | null>(null);
  const nowLineRef = useRef<HTMLDivElement>(null);
  const nowScrolledRef = useRef(false);

  useEffect(() => {
    // One frame after mount so hydration commits first (a synchronous setState
    // here reads as a cascading render), then the 30s clock takes over.
    let frame = 0;
    frame = window.requestAnimationFrame(() => setNow(new Date()));
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!now || nowScrolledRef.current) return;
    nowScrolledRef.current = true;
    nowLineRef.current?.scrollIntoView({ block: "center" });
  }, [now]);

  // Show the budget at all times: read the live counter whenever the
  // connection changes (a generation overwrites it with a fresher value,
  // and this fetch never spends anything).
  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      if (!isAiConfigured(settings)) {
        setQuota(null);
        return;
      }
      const live = await readQuotaUsage(settings);
      if (!cancelled) setQuota(live);
    }
    loadQuota();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    async function fetchEvents() {
      const { data, error } = await supabase.from("calendar_events").select("*");
      if (cancelled) return;
      if (error) console.error(error);
      else setEvents(data);
    }
    fetchEvents();
    // The chat panel's approval cards write through the server, so refetch
    // whenever a proposal is applied — same tab or another one.
    const unsubscribe = subscribeCalendarChanges(fetchEvents);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [supabase]);

  const hourHeight = 80;
  // Where the now-line sits in today's column (0=Sunday…6=Saturday, same
  // indexing the events use) — computed from the ticking clock above.
  const nowDay = now ? now.getDay() : -1;
  const nowTop =
    now !== null ? (now.getHours() + now.getMinutes() / 60 - hours[0]) * hourHeight : 0;
  const editing = events.find((e) => e.id === editingId) ?? null;
  const modalOpen = selectedSlot !== null || editing !== null;
  const maxDuration = 24 - formHour;

  function resetForm() {
    setTitle("");
    setDuration(1);
    setColor("#7CA9BD");
    setSelectedSlot(null);
    setEditingId(null);
  }

  function openForSlot(day: number, hour: number) {
    setEditingId(null);
    setTitle("");
    setDuration(1);
    setColor("#7CA9BD");
    setFormDay(day);
    setFormHour(hour);
    setSelectedSlot({ day, hour });
  }

  function openForEdit(event: CalendarEvent) {
    setSelectedSlot(null);
    setEditingId(event.id);
    setTitle(event.title);
    setDuration(Math.min(event.duration, 24 - event.start_hour));
    setColor(event.color);
    setFormDay(event.day);
    setFormHour(event.start_hour);
  }

  async function saveNew() {
    if (!selectedSlot || !title.trim()) return;
    const safeDuration = Math.min(Math.max(0.5, duration), 24 - formHour);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("Not signed in — cannot save.");
      return;
    }
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        title: title.trim(),
        day: formDay,
        start_hour: formHour,
        duration: safeDuration,
        color,
        user_id: user.id,
      })
      .select();
    if (error) {
      console.error(error);
      return;
    }
    setEvents((currentEvents) => [...currentEvents, ...data]);
    resetForm();
  }

  async function saveEdit() {
    if (!editing || !title.trim()) return;
    const safeDuration = Math.min(Math.max(0.5, duration), 24 - formHour);
    const { data, error } = await supabase
      .from("calendar_events")
      .update({
        title: title.trim(),
        day: formDay,
        start_hour: formHour,
        duration: safeDuration,
        color,
      })
      .eq("id", editing.id)
      .select();
    if (error) {
      console.error(error);
      return;
    }
    setEvents((currentEvents) =>
      currentEvents.map((e) => (e.id === editing.id ? data[0] : e))
    );
    resetForm();
  }

  async function removeEditing() {
    if (!editing) return;
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", editing.id);
    if (error) {
      console.error(error);
      return;
    }
    setEvents((currentEvents) =>
      currentEvents.filter((e) => e.id !== editing.id)
    );
    resetForm();
  }

  // The "Generate schedule" button: first a small dialog for an optional
  // note ("finish the essay before Sunday"), then the AI lays the week out
  // around the existing obligations, events and open goals. Without a
  // configured connection, the settings dialog opens instead (same as chat).
  function openCompose() {
    setGenError(null);
    setNote("");
    setComposeOpen(true);
  }

  async function runGeneration(requestedNote: string) {
    if (generating) return;
    setComposeOpen(false);
    setGenError(null);
    if (!isAiConfigured(settings)) {
      setSettingsOpen(true);
      return;
    }
    setGenerating(true);
    try {
      const result = await generateSchedule(settings, requestedNote);
      setQuota(result.quota);
      setDrafts(result.events);
      previewDrafts(result.events);
    } catch (error) {
      const failed = error as AiRequestError;
      if (failed.quota) setQuota(failed.quota);
      setGenError((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  // Show what the review modal is about to accept as ghosts on the grid
  // behind it (they hide when it closes — see the comment above), and what
  // the chat's approval card is about to accept.
  function previewDrafts(items: CalendarPreviewDraft[] | null) {
    setCalendarPreview(items && items.length ? { drafts: items, hiddenIds: [] } : null);
  }

  function closeDrafts() {
    previewDrafts(null);
    setDrafts(null);
  }

  function removeDraft(index: number) {
    if (!drafts) return;
    // Side effects can't live inside a setState updater (it runs during
    // render) — compute the next list up front and publish the preview
    // after queueing the state update.
    const next = drafts.filter((_, i) => i !== index);
    setDrafts(next);
    previewDrafts(next);
  }

  // Save the reviewed drafts in one insert, rotating the palette the manual
  // event modal offers so the batch doesn't land in a single color.
  async function addDrafts() {
    if (!drafts || drafts.length === 0) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("Not signed in — cannot save.");
      return;
    }
    const rows = drafts.map((item, index) => ({
      title: item.title,
      day: item.day,
      start_hour: item.start_hour,
      duration: item.duration,
      color: EVENT_SWATCHES[(events.length + index) % EVENT_SWATCHES.length],
      user_id: user.id,
    }));
    const { data, error } = await supabase
      .from("calendar_events")
      .insert(rows)
      .select();
    if (error) {
      console.error(error);
      setGenError("Couldn't save the generated events — try again.");
      closeDrafts();
      return;
    }
    setEvents((currentEvents) => [...currentEvents, ...data]);
    closeDrafts();
  }

  return (
    <div className="h-full overflow-auto bg-[#E4E0D8]">
      {/* Sticky top: the toolbar plus day names stay visible while the
          auto-scroll (and any manual scrolling) moves the 24h grid. */}
      <div className="sticky top-0 z-30 bg-[#E4E0D8]">
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-b border-[#b8b5ae] px-3 py-2 sm:px-4">
          {genError && <p className="mr-auto text-[12px] text-[#D26390]">{genError}</p>}
          <QuotaBadge usage={quota} />
          <button
            type="button"
            onClick={openCompose}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg border border-[#b8b5ae] px-3 py-1.5 text-[13px] text-[#1D2525] transition-colors hover:border-[#16759b] hover:text-[#16759b] disabled:cursor-wait disabled:opacity-60"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-3 w-3"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6 0l1.2 3.3L10.5 4.5 7.2 5.7 6 9 4.8 5.7 1.5 4.5l3.3-1.2L6 0zM10.5 7.5l.6 1.65 1.65.6-1.65.6-.6 1.65-.6-1.65-1.65-.6 1.65-.6.6-1.65z" />
            </svg>
            {generating ? "Generating…" : "Generate schedule"}
          </button>
        </div>
        {/* Desktop day names. Phones get the tab switcher below instead —
            7 columns can't fit 360px, so the grid shows one day. */}
        <div className="hidden grid-cols-8 border-b border-[#b8b5ae] bg-[#E4E0D8] sm:grid">
          <div></div>
          {days.map((day) => (
            <div
              key={day}
              className={`border-l border-[#b8b5ae] py-3 text-center text-lg ${
                nowDay >= 0 && days[nowDay] === day ? "font-semibold text-[#16759b]" : ""
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        {/* Phone day switcher. */}
        <div
          role="tablist"
          aria-label="Show day"
          className="flex gap-1.5 overflow-x-auto border-b border-[#b8b5ae] bg-[#E4E0D8] px-3 py-2 sm:hidden"
        >
          {days.map((day, index) => (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={phoneDay === index}
              onClick={() => setPhoneDay(index)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16759b] ${
                phoneDay === index
                  ? "bg-[#1D2525] text-[#E4E0D8]"
                  : "border border-[#b8b5ae] text-[#6b6963]"
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>
      {/* One column (plus gutter) on phones — only the selected day renders;
          full 8-column week from sm up. */}
      <div className="grid grid-cols-[52px_1fr] sm:grid-cols-8">
        <div>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: `${hourHeight}px` }}
              className="border-t border-[#b8b5ae] pr-2 pt-1 text-right text-[11px] text-[#666] sm:pr-3 sm:text-sm"
            >
              {hour === 0
                ? "12 AM"
                : hour < 12
                  ? `${hour} AM`
                  : hour === 12
                    ? "12 PM"
                    : `${hour - 12} PM`}
            </div>
          ))}
        </div>
        {days.map((_, dayIndex) => (
          <div
            key={dayIndex}
            className={`relative border-l border-[#b8b5ae] ${dayIndex === phoneDay ? "" : "hidden"} sm:block`}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: `${hourHeight}px` }}
                title={`${days[dayIndex]} ${fmt(hour)} - add event`}
                className="cursor-pointer border-b border-[#b8b5ae] transition-colors hover:bg-black/[0.04]"
                onClick={() => openForSlot(dayIndex, hour)}
              />
            ))}
            {events
              .filter((event) => event.day === dayIndex)
              .map((event) => {
                const top = (event.start_hour - hours[0]) * hourHeight;
                const height = event.duration * hourHeight;
                const darkText = event.color === "#F5E573";
                // Slated for removal/move in an open review: fade out.
                const fading = preview?.hiddenIds.includes(event.id) ?? false;

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openForEdit(event)}
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height - 3, 26)}px`,
                      backgroundColor: event.color || "#7CA9BD",
                      color: fading ? undefined : darkText ? "#000" : "#FFF",
                    }}
                    className={`absolute left-1 right-1 rounded-lg border p-2 text-left text-sm transition-all hover:brightness-[1.04] ${
                      fading
                        ? "border-dashed border-[#b8b5ae] bg-white/40 text-[#6b6963] opacity-50"
                        : "border-black/25"
                    }`}
                  >
                    <span className="block truncate font-medium leading-tight">
                      {event.title}
                    </span>
                    <span
                      className={`block text-[11px] leading-tight tabular-nums ${
                        fading
                          ? "text-[#6b6963]/70"
                          : darkText
                            ? "text-black/70"
                            : "text-white/75"
                      }`}
                    >
                      {rangeLabel(event.start_hour, event.duration)}
                    </span>
                  </button>
                );
              })}
            {(preview?.drafts ?? [])
              .filter((draft) => draft.day === dayIndex)
              .map((draft, index) => {
                const top = (draft.start_hour - hours[0]) * hourHeight;
                return (
                  <div
                    key={`${draft.title}-${draft.start_hour}-${index}`}
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(draft.duration * hourHeight - 3, 26)}px`,
                    }}
                    className="pointer-events-none absolute left-1 right-1 rounded-lg border-2 border-dashed border-[#16759b]/60 bg-[#16759b]/10 p-2 text-left text-sm"
                    aria-hidden="true"
                  >
                    <span className="block truncate font-medium leading-tight text-[#16759b]">
                      {draft.title}
                    </span>
                    <span className="block text-[11px] leading-tight tabular-nums text-[#16759b]/70">
                      {rangeLabel(draft.start_hour, draft.duration)}
                    </span>
                  </div>
                );
              })}
            {now && nowDay === dayIndex && (
              <div
                ref={nowLineRef}
                style={{ top: `${nowTop}px` }}
                title={`Now · ${fmt(now.getHours() + now.getMinutes() / 60)}`}
                className="pointer-events-none absolute inset-x-0 z-20"
                aria-hidden="true"
              >
                <div className="relative h-0.5 -translate-y-px bg-[#D26390]">
                  <span className="absolute -left-1 -top-[3px] block h-2 w-2 rounded-full bg-[#D26390]" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-3 sm:items-center sm:p-6"
          onClick={resetForm}
        >
          <div
            className="max-h-[90vh] w-full max-w-[400px] overflow-y-auto rounded-2xl bg-[#0C425A] p-5 text-[#E4E0D8] shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-serif text-2xl font-medium">
              {editing ? "Edit Event" : "Add Event"}
            </h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              {`${days[formDay]} · ${rangeLabel(formHour, duration)}`}
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editing) saveEdit();
                  else saveNew();
                }
                if (e.key === "Escape") resetForm();
              }}
              className="mb-4 w-full rounded-lg border border-[#777] bg-transparent px-3 py-2 outline-none placeholder:text-[#888] focus:border-[#16759b]"
            />

            <label className="mb-1.5 block text-sm">Day</label>
            <div className="mb-4 flex gap-1.5">
              {WEEKDAY_INITIALS.map((letter, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={days[idx]}
                  aria-pressed={formDay === idx}
                  onClick={() => setFormDay(idx)}
                  className={`h-9 w-9 rounded-lg border text-[13px] transition-colors ${
                    formDay === idx
                      ? "border-[#6DBACB] bg-[#16759b] text-white"
                      : "border-[#777] text-[#E4E0D8]/70 hover:bg-white/10"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>

            <div className="mb-4 grid grid-cols-[1fr_1.4fr] gap-3">
              <div>
                <label className="mb-1.5 block text-sm">Starts</label>
                <select
                  value={formHour}
                  onChange={(e) => {
                    const nextHour = Number(e.target.value);
                    setFormHour(nextHour);
                    setDuration((d) => Math.min(d, 24 - nextHour));
                  }}
                  className="w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 outline-none"
                >
                  {startTimes.map((h) => (
                    <option key={h} value={h}>
                      {fmt(h)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm">Duration</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 outline-none"
                >
                  {Array.from(
                    { length: Math.floor(maxDuration * 2) },
                    (_, i) => (i + 1) / 2
                  ).map((h) => (
                    <option key={h} value={h}>
                      {durationLabel(h)}
                      {` - ends ${fmt(Math.min(formHour + h, 24))}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4 flex gap-3">
              {EVENT_SWATCHES.map((eventColor) => (
                <button
                  key={eventColor}
                  type="button"
                  onClick={() => setColor(eventColor)}
                  aria-label={`Use color ${eventColor}`}
                  style={{
                    backgroundColor: eventColor,
                  }}
                  className={`h-8 w-8 rounded-full hover:brightness-110 ${
                    color === eventColor
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0C425A]"
                      : "ring-1 ring-white/20"
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                {editing && (
                  <button
                    onClick={removeEditing}
                    className="rounded-lg px-3 py-2 text-[14px] text-[#E4E0D8]/70 hover:bg-white/10 hover:text-[#E4E0D8]"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={resetForm}
                  className="rounded-lg px-4 py-2 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  onClick={editing ? saveEdit : saveNew}
                  disabled={!title.trim()}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {editing ? "Save" : "Add Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-3 sm:items-center sm:p-6"
          onClick={() => setComposeOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-[400px] overflow-y-auto rounded-2xl bg-[#0C425A] p-5 text-[#E4E0D8] shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-serif text-2xl font-medium">Generate schedule</h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              The AI plans around your obligations, existing events and open
              goals — tell it anything specific to work in.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Finish the essay before Sunday, gym Mon/Wed/Fri…"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runGeneration(note);
                if (e.key === "Escape") setComposeOpen(false);
              }}
              className="mb-4 w-full resize-none rounded-lg border border-[#777] bg-transparent px-3 py-2 outline-none placeholder:text-[#888] focus:border-[#6DBACB]"
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="rounded-lg px-4 py-2 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => runGeneration(note)}
                disabled={generating}
                className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}
      {drafts && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-3 sm:items-center sm:p-6"
          onClick={closeDrafts}
        >
          <div
            className="max-h-[90vh] w-full max-w-[440px] overflow-y-auto rounded-2xl bg-[#0C425A] p-5 text-[#E4E0D8] shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 font-serif text-2xl font-medium">Suggested schedule</h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              The dashed blocks on the grid behind this are what you would get —
              click any event on the calendar afterwards to edit it.
            </p>
            {drafts.length === 0 ? (
              <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
                Nothing left to add — close this and generate again.
              </p>
            ) : (
              <ul className="mb-4 max-h-[300px] space-y-1.5 overflow-auto pr-1">
                {drafts.map((item, index) => (
                  <li
                    key={`${item.day}-${item.start_hour}-${index}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/5 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 basis-full truncate text-[14px] min-[400px]:basis-auto">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-[#E4E0D8]/60">
                      {days[item.day]} {rangeLabel(item.start_hour, item.duration)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDraft(index)}
                      aria-label={`Remove "${item.title}"`}
                      className="shrink-0 rounded p-1 text-[#E4E0D8]/50 transition hover:bg-white/10 hover:text-[#E4E0D8]"
                    >
                      <svg
                        viewBox="0 0 12 12"
                        className="h-2.5 w-2.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeDrafts}
                className="rounded-lg px-4 py-2 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addDrafts}
                disabled={drafts.length === 0}
                className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add {drafts.length} event{drafts.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
      <AiSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
