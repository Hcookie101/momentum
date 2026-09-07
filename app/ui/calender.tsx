"use client";
import { useState } from "react";

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);

type CalendarEvent = {
  id: string;
  title: string;
  day: number;
  startHour: number;
  duration: number;
  color: string;
};

export default function Calendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{
    day: number;
    hour: number;
  } | null>(null);
    const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(1);
  const [color, setColor] = useState("#316C85");

  const hourHeight = 80;

  function addEvent() {
    if (!selectedSlot || !title.trim()) return;
    const newEvent: CalendarEvent = {
      id: crypto.randomUUID(),
      title: title.trim(),
      day: selectedSlot.day,
      startHour: selectedSlot.hour,
      duration: duration,
      color: color,
    };
    setEvents((currentEvents) => [...currentEvents, newEvent]);
    setTitle("");
    setDuration(1);
    setColor("#316C85");
    setSelectedSlot(null);
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
                className="cursor-pointer border-b border-[#b8b5ae] transition-colors hover:bg-black/[0.04]"
                onClick={() => setSelectedSlot({ day: dayIndex, hour: hour })}
              />
            ))}
            {events
              .filter((event) => event.day === dayIndex)
              .map((event) => {
                const top = (event.startHour - hours[0]) * hourHeight;

                const height = event.duration * hourHeight;

                return (
                  <div
                    key={event.id}
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      backgroundColor: event.color || "#7CA9BD",
                      color: event.color === "#F5E573" ? "#000" : "#FFF",
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="border-1 border-[#000] absolute left-1 right-1 rounded-lg bg-[#16759b] p-2 text-sm"
                  >
                    {event.title}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-[#0C425A] w-[400px] rounded-2xl p-6 text-[#E4E0D8] shadow-xl">
            <h2 className="mb-5 text-2xl font-medium">Add Event</h2>
            <label className="mb-2 block text-sm">Event name: </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event name"
              autoFocus
              className="mb-5 w-full rounded-lg border border-[#777] bg-transparent px-3 py-2 outline-none placeholder:text-[#888] focus:border-[#16759b]"
            />

            <label className="mb-2 block text-sm">
              Duration: 
            </label>

            <select
              value={duration}
              onChange={(e) =>
                setDuration(Number(e.target.value))
              }
              className="mb-5 w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 outline-none"
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                <option key={h} value={h}>
                  {h} hour{h > 1 ? "s" : ""}
                </option>
              ))}
            </select>

            <label className="mb-2 block text-sm">
              Color
            </label>

            <div className="mb-6 flex gap-3">

              {[
                "#7CA9BD",
                "#F5E573",
                "#D26390",
              ].map((eventColor) => (
                <button
                  key={eventColor}
                  onClick={() => setColor(eventColor)}
                  style={{
                    backgroundColor: eventColor,
                  }}
                  className={`h-8 w-8 rounded-full hover:brightness-90 ${
                    color === eventColor
                      ? "ring-2 ring-white ring-offset-2 ring-offset-[#192221]"
                      : ""
                  }`}
                />
              ))}

            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3">

              <button
                onClick={() => setSelectedSlot(null)}
                className="rounded-lg px-4 py-2 hover:bg-white/10"
              >
                Cancel
              </button>

              <button
                onClick={addEvent}
                className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad]"
              >
                Add Event
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
