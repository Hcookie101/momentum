"use client";
import { useState, useEffect } from "react";
import { Tables } from "@/supabase/types";
import { createClient } from "@/supabase/client";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);
const startTimes = Array.from({ length: 48 }, (_, i) => i / 2);

type Obligation = Tables<"obligations">;

const SWATCHES = ["#7CA9BD", "#D26390", "#F5E573"];
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

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

function dayListLabel(selected: number[]) {
  if (selected.length === 0) return "No days";
  if (selected.length === 7) return "Every day";
  return [...selected]
    .sort((a, b) => a - b)
    .map((d) => days[d])
    .join(", ");
}

export default function Obligations() {
  const [supabase] = useState(() => createClient());
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    hour: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [color, setColor] = useState(SWATCHES[0]);
  const [patternDays, setPatternDays] = useState<number[]>([]);
  const [formHour, setFormHour] = useState(0);

  useEffect(() => {
    async function fetchObligations() {
      const { data, error } = await supabase.from("obligations").select("*");
      if (error) console.error(error);
      else setObligations(data);
    }
    fetchObligations();
  }, [supabase]);

  const hourHeight = 72;
  const totalHours = obligations.reduce(
    (sum, o) => sum + o.duration * o.days.length,
    0
  );
  const editing = obligations.find((o) => o.id === editingId) ?? null;

  function resetForm() {
    setTitle("");
    setDuration(1);
    setColor(SWATCHES[0]);
    setPatternDays([]);
    setSelectedSlot(null);
    setEditingId(null);
  }

  function openForSlot(day: number, hour: number) {
    setEditingId(null);
    setTitle("");
    setDuration(1);
    setColor(SWATCHES[0]);
    setPatternDays([day]);
    setFormHour(hour);
    setSelectedSlot({ day, hour });
  }

  function openForEdit(o: Obligation) {
    setSelectedSlot(null);
    setEditingId(o.id);
    setTitle(o.title);
    setDuration(Math.min(o.duration, 24 - o.start_hour));
    setColor(o.color);
    setPatternDays([...o.days]);
    setFormHour(o.start_hour);
  }

  async function saveNew() {
    if (!selectedSlot || !title.trim() || patternDays.length === 0) return;
    const maxDur = 24 - formHour;
    const safeDuration = Math.min(Math.max(0.5, duration), maxDur);
    const { data, error } = await supabase
      .from("obligations")
      .insert({
        title: title.trim(),
        days: [...patternDays].sort((a, b) => a - b),
        start_hour: formHour,
        duration: safeDuration,
        color,
      })
      .select();
    if (error) {
      console.error(error);
      return;
    }
    setObligations((prev) => [...prev, ...data]);
    resetForm();
  }

  async function saveEdit() {
    if (!editing || !title.trim() || patternDays.length === 0) return;
    const maxDur = 24 - formHour;
    const safeDuration = Math.min(Math.max(0.5, duration), maxDur);
    const { data, error } = await supabase
      .from("obligations")
      .update({
        title: title.trim(),
        days: [...patternDays].sort((a, b) => a - b),
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
    setObligations((prev) => prev.map((o) => (o.id === editing.id ? data[0] : o)));
    resetForm();
  }

  async function removeEditing() {
    if (!editing) return;
    const { error } = await supabase
      .from("obligations")
      .delete()
      .eq("id", editing.id);
    if (error) {
      console.error(error);
      return;
    }
    setObligations((prev) => prev.filter((o) => o.id !== editing.id));
    resetForm();
  }

  const modalOpen = selectedSlot !== null || editing !== null;

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col bg-[#E4E0D8]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#b8b5ae] px-6 pb-3 pt-4">
        <div>
          <h1 className="mt-0.5 text-[24px] font-medium leading-tight text-[#1D2525]">
            Obligations
          </h1>
          <p className="mt-0.5 text-[13px] text-[#6b6963]">
            Classes, workouts, family time. Click any empty slot to pin
            one down.
          </p>
        </div>
        <div className="flex items-center gap-4 pb-0.5 text-[13px] text-[#6b6963]">
          <span>
            <span className="font-semibold tabular-nums text-[#1D2525]">
              {obligations.length}
            </span>{" "}
            pinned
          </span>
          <span className="h-3 w-px bg-[#b8b5ae]" />
          <span>
            <span className="font-semibold tabular-nums text-[#1D2525]">
              {totalHours}h
            </span>{" "}
            locked / week
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="sticky top-0 z-10 grid grid-cols-8 bg-[#E4E0D8]">
          <div className="border-b border-[#b8b5ae]" />
          {days.map((day) => (
            <div
              key={day}
              className="border-b border-l border-[#b8b5ae] py-2.5 text-center text-[15px] text-[#1D2525]"
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
                className="border-b border-[#b8b5ae]/60 pr-3 pt-1 text-right text-[12px] tabular-nums text-[#7a7771]"
              >
                {fmt(hour)}
              </div>
            ))}
          </div>
          {/*__GRID__*/}
          {days.map((_, dayIndex) => (
            <div key={dayIndex} className="relative border-l border-[#b8b5ae]">
              {hours.map((hour) => (
                <div
                  key={hour}
                  style={{ height: `${hourHeight}px` }}
                  onClick={() => openForSlot(dayIndex, hour)}
                  title={`${days[dayIndex]} ${fmt(hour)} - add obligation`}
                  className="cursor-pointer border-b border-[#b8b5ae]/60 transition-colors hover:bg-black/[0.04]"
                />
              ))}
              {obligations
                .filter((o) => o.days.includes(dayIndex))
                .map((o) => {
                  const top = o.start_hour * hourHeight;
                  const height = o.duration * hourHeight;
                  const darkText = o.color === "#F5E573";
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => openForEdit(o)}
                      style={{
                        top: `${top}px`,
                        height: `${Math.max(height - 3, 26)}px`,
                        backgroundColor: o.color,
                        color: darkText ? "#1D2525" : "#F5F3EE",
                      }}
                      className="absolute left-1 right-1 rounded-md border border-black/25 px-2 py-1 text-left shadow-[0_1px_0_rgba(0,0,0,0.15)] hover:brightness-[1.04]"
                    >
                      <span className="block truncate text-[13px] font-medium leading-tight">
                        {o.title}
                      </span>
                      <span
                        className={`block text-[11px] tabular-nums leading-tight ${
                          darkText ? "text-[#1D2525]/70" : "text-white/75"
                        }`}
                      >
                        {rangeLabel(o.start_hour, o.duration)}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
        {obligations.length === 0 && (
          <p className="sticky bottom-3 mx-auto w-fit rounded-full border border-[#b8b5ae] bg-[#F5F3EE] px-4 py-1.5 text-[12.5px] text-[#6b6963] shadow-sm">
            Nothing added yet. Pick a time above, e.g. Mon 9 AM for class.
          </p>
        )}
      </div>
      {/*__MODAL__*/}
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
              {editing ? "Edit obligation" : "New obligation"}
            </h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              {`${dayListLabel(patternDays)} · ${rangeLabel(
                formHour,
                duration
              )} · repeats weekly`}
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chem lecture, gym, family dinner"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editing) {
                    saveEdit();
                  } else {
                    saveNew();
                  }
                }
                if (e.key === "Escape") resetForm();
              }}
              className="mb-4 w-full rounded-lg border border-[#777] bg-transparent px-3 py-2 outline-none placeholder:text-[#888] focus:border-[#6DBACB]"
            />
            <label className="mb-1.5 block text-sm">Days</label>
            <div className="mb-4 flex gap-1.5">
              {WEEKDAY_INITIALS.map((letter, idx) => {
                const isOn = patternDays.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={days[idx]}
                    aria-pressed={isOn}
                    onClick={() =>
                      setPatternDays((prev) =>
                        isOn
                          ? prev.filter((d) => d !== idx)
                          : [...prev, idx].sort((a, b) => a - b)
                      )
                    }
                    className={`h-9 w-9 rounded-lg border text-[13px] transition-colors ${
                      isOn
                        ? "border-[#6DBACB] bg-[#16759b] text-white"
                        : "border-[#777] text-[#E4E0D8]/70 hover:bg-white/10"
                    }`}
                  >
                    {letter}
                  </button>
                );
              })}
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
                    { length: Math.floor(Math.min(8, 24 - formHour) * 2) },
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
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Use color ${c}`}
                  style={{ backgroundColor: c }}
                  className={`h-8 w-8 rounded-full hover:brightness-110 ${
                    color === c
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#0C425A]"
                      : "ring-1 ring-white/20"
                  }`}
                />
              ))}
            </div>
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
                  disabled={!title.trim() || patternDays.length === 0}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {editing ? "Save" : "Pin it"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
