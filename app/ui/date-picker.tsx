"use client";

import { useRef, useState } from "react";

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DatePicker() {
  const [selectedDate, setSelectedDate] = useState(() =>
    toLocalDateString(new Date())
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const isToday = selectedDate === toLocalDateString(new Date());

  const displayText = isToday
    ? "Today"
    : new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // Fallback for browsers without showPicker() support
      input.click();
    }
  }

  return (
    <div className="flex items-center justify-center bg-[#C9C6C0] py-3">
      <button
        type="button"
        onClick={openPicker}
        aria-label="Change date"
        className="relative h-[2.5em] w-[6em] rounded-xl bg-[#7CA9BD] text-[15px] font-medium text-[#1D2525] shadow-lg transition-transform hover:scale-105 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB] focus-visible:ring-offset-2"
      >
        {displayText}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={selectedDate}
        onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
