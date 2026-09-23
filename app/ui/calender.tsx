"use client";
import { useState } from "react";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);
const startTimes = Array.from({ length: 48 }, (_, i) => i / 2);

type CalendarEvent = {
  id: string;
  title: string;
  day: number;
  startHour: number;
  duration: number;
  color: string;
};

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

export default function Calendar() {
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

  const hourHeight = 80;
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
    setDuration(Math.min(event.duration, 24 - event.startHour));
    setColor(event.color);
    setFormDay(event.day);
    setFormHour(event.startHour);
  }

  function saveNew() {
    if (!selectedSlot || !title.trim()) return;
    const safeDuration = Math.min(Math.max(0.5, duration), 24 - formHour);
    setEvents((currentEvents) => [
      ...currentEvents,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        day: formDay,
        startHour: formHour,
        duration: safeDuration,
        color,
      },
    ]);
    resetForm();
  }

  function saveEdit() {
    if (!editing || !title.trim()) return;
    const safeDuration = Math.min(Math.max(0.5, duration), 24 - formHour);
    setEvents((currentEvents) =>
      currentEvents.map((e) =>
        e.id === editing.id
          ? {
              ...e,
              title: title.trim(),
              day: formDay,
              startHour: formHour,
              duration: safeDuration,
              color,
            }
          : e
      )
    );
    resetForm();
  }

  function removeEditing() {
    if (!editing) return;
    setEvents((currentEvents) =>
      currentEvents.filter((e) => e.id !== editing.id)
    );
    resetForm();
  }
  return (
    <div className="h-full overflow-auto bg-[#E4E0D8]">
      <div className="grid grid-cols-8">
        <div></div>
        {days.map((day) => (
          <div
            key={day}
            className="border-b border-l border-[#b8b5ae] py-3 text-center text-lg"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-8">
        <div>
          {hours.map((hour) => (
            <div
              key={hour}
              style={{ height: `${hourHeight}px` }}
              className="border-t border-[#b8b5ae] pr-3 pt-1 text-right text-sm text-[#666]"
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
          <div key={dayIndex} className="relative border-l border-[#b8b5ae]">
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
                const top = (event.startHour - hours[0]) * hourHeight;
                const height = event.duration * hourHeight;
                const darkText = event.color === "#F5E573";

                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => openForEdit(event)}
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height - 3, 26)}px`,
                      backgroundColor: event.color || "#7CA9BD",
                      color: darkText ? "#000" : "#FFF",
                    }}
                    className="absolute left-1 right-1 rounded-lg border border-black/25 p-2 text-left text-sm hover:brightness-[1.04]"
                  >
                    <span className="block truncate font-medium leading-tight">
                      {event.title}
                    </span>
                    <span
                      className={`block text-[11px] leading-tight tabular-nums ${
                        darkText ? "text-black/70" : "text-white/75"
                      }`}
                    >
                      {rangeLabel(event.startHour, event.duration)}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={resetForm}
        >
          <div
            className="w-[400px] rounded-2xl bg-[#0C425A] p-6 text-[#E4E0D8] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-2xl font-medium">
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
            <div className="flex items-center justify-between">
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
    </div>
  );
}
