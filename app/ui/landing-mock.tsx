const SWATCH = {
  blue: "#7CA9BD",
  pink: "#D26390",
  yellow: "#F5E573",
} as const;

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];

// A quiet week, drawn the way the app draws it — same swatches, same
// hairlines, nothing floating or glowing.
export function WeekMock() {
  const columns: { label: string; color: string; height: string }[][] = [
    [],
    [
      { label: "Gym", color: SWATCH.blue, height: "h-9" },
      { label: "Thesis", color: SWATCH.yellow, height: "h-14" },
    ],
    [{ label: "Shift", color: SWATCH.pink, height: "h-20" }],
    [
      { label: "Gym", color: SWATCH.blue, height: "h-9" },
      { label: "Reading", color: SWATCH.blue, height: "h-10" },
    ],
    [{ label: "Thesis", color: SWATCH.yellow, height: "h-16" }],
    [{ label: "Shift", color: SWATCH.pink, height: "h-12" }],
    [],
  ];
  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((day, i) => (
          <div
            key={i}
            className="pb-1 text-center text-[10px] tabular-nums text-[#8a8780]"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {columns.map((blocks, i) => (
          <div key={i} className="min-h-[86px] space-y-1">
            {blocks.map((block, j) => (
              <div
                key={j}
                style={{ backgroundColor: block.color }}
                className={`${block.height} rounded-[5px] border border-black/20 px-1 pt-0.5`}
              >
                <span className="block truncate text-[9px] font-medium leading-tight text-[#1D2525]">
                  {block.label}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalRow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none flex select-none items-center gap-2.5 border-b border-[#b8b5ae]/60 px-4 py-2.5"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-[#8a8780]">
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="#16759b"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6.5 4.8 9 10 3.5" />
        </svg>
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-[#1D2525]">
        Run a half marathon
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-[#6b6963]">
        12 days left
      </span>
    </div>
  );
}

export function TuesdayList() {
  const rows = [
    { time: "7:00 AM", title: "Gym", color: SWATCH.blue, meta: "1h" },
    { time: "9:00 AM", title: "Thesis draft", color: SWATCH.yellow, meta: "2h" },
    { time: "12:30 PM", title: "Lunch", color: null as string | null, meta: "out" },
    { time: "2:00 PM", title: "Shift", color: SWATCH.pink, meta: "4h" },
    { time: "7:30 PM", title: "Reading", color: SWATCH.blue, meta: "45 min" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-[#b8b5ae]">
      {rows.map((row, i) => (
        <div
          key={row.time}
          className={`flex items-center gap-4 bg-[#EFECE5] px-5 py-3 ${i < rows.length - 1 ? "border-b border-[#b8b5ae]/60" : ""}`}
        >
          <span className="w-20 shrink-0 text-[12px] tabular-nums text-[#8a8780]">
            {row.time}
          </span>
          <span
            className="h-8 w-1.5 shrink-0 rounded-full border"
            style={{
              backgroundColor: row.color ?? "transparent",
              borderColor: row.color ? "rgba(0,0,0,0.2)" : "#b8b5ae",
            }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[15px]">{row.title}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-[#8a8780]">
            {row.meta}
          </span>
        </div>
      ))}
    </div>
  );
}
