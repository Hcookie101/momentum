"use client";

import { useEffect, useState } from "react";
import Chat from "@/app/ui/chat";
import DatePicker from "@/app/ui/date-picker";
import { createClient } from "@/supabase/client";
import { Tables } from "@/supabase/types";
import {
  addDays,
  categoryFor,
  dayRange,
  formatCompact,
  formatDuration,
  OTHER_CATEGORY,
  toLocalDateString,
} from "@/app/lib/stats";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
} from "recharts";
import type { BarShapeProps, PieSectorShapeProps } from "recharts";

type FocusSession = Tables<"focus_sessions">;
type SiteTotal = { domain: string; seconds: number };
type CategoryTotal = { name: string; color: string; seconds: number };
type WeekBucket = { day: string; label: string; seconds: number };

export default function Stats() {
  const [supabase] = useState(() => createClient());
  const [date, setDate] = useState(() => toLocalDateString(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<FocusSession[]>([]);
  const [weekFocus, setWeekFocus] = useState<FocusSession[]>([]);
  const [siteRows, setSiteRows] = useState<
    { domain: string; duration_seconds: number }[]
  >([]);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      const { from, to } = dayRange(date);
      const weekFrom = dayRange(addDays(date, -6)).from;

      try {
        const [focusRes, weekRes, siteRes, goalRes, subRes] =
          await Promise.all([
            supabase
              .from("focus_sessions")
              .select("*")
              .gte("start_time", from)
              .lt("start_time", to),
            supabase
              .from("focus_sessions")
              .select("*")
              .gte("start_time", weekFrom)
              .lt("start_time", to),
            supabase
              .from("browsing_sessions")
              .select("domain, duration_seconds")
              .gte("visited_at", from)
              .lt("visited_at", to),
            supabase
              .from("goals")
              .select("id, completed_at")
              .eq("completed", true)
              .gte("completed_at", from)
              .lt("completed_at", to),
            supabase
              .from("subgoals")
              .select("id, completed_at")
              .eq("completed", true)
              .gte("completed_at", from)
              .lt("completed_at", to),
          ]);
        if (cancelled) return;
        const failure =
          focusRes.error ??
          weekRes.error ??
          siteRes.error ??
          goalRes.error ??
          subRes.error;
        if (failure) throw failure;

        setFocus(focusRes.data ?? []);
        setWeekFocus(weekRes.data ?? []);
        setSiteRows(siteRes.data ?? []);
        setCompleted((goalRes.data?.length ?? 0) + (subRes.data?.length ?? 0));
      } catch (err) {
        console.error("Failed to load stats:", err);
        if (!cancelled) {
          setError("Couldn't load stats — check your connection and retry.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, [date, supabase]);

  const totalFocus = sumFocus(focus);
  const rated = focus.filter((row) => row.focus_score !== null);
  const avgScore = rated.length
    ? rated.reduce((sum, row) => sum + (row.focus_score ?? 0), 0) / rated.length
    : null;

  const sites = groupByDomain(siteRows);
  const categories = groupCategories(sites);

  const week = buildWeek(date, weekFocus);

  const isToday = date === toLocalDateString(new Date());

  return (
    <div className="flex h-[calc(100vh-40px)]">
      <div className="flex-1 flex flex-col min-w-0">
        <DatePicker value={date} onChange={setDate} />
        {error && (
          <p className="bg-[#D26390] px-4 py-1.5 text-center text-[13px] text-white">
            {error}
          </p>
        )}
        <div className="flex-1 min-h-0 bg-[#C9C6C0] overflow-y-auto grid gap-4 grid-cols-2 grid-rows-[220px_160px_160px_180px_180px] [grid-template-areas:'a_a'_'b_c'_'b_d'_'e_f'_'e_f'] p-4">
          <TotalFocusCard seconds={totalFocus} loading={loading} />
          <SitesCard sites={sites.slice(0, 6)} loading={loading} />
          <ScoreCard average={avgScore} loading={loading} />
          <TasksCard count={completed} today={isToday} loading={loading} />
          <CategoriesCard categories={categories} loading={loading} />
          <WeekCard week={week} selectedDay={date} loading={loading} />
        </div>
      </div>
      <Chat />
    </div>
  );
}

// ---- aggregation helpers ------------------------------------------------
function sumFocus(rows: FocusSession[]): number {
  return rows.reduce((total, row) => {
    if (!row.end_time) return total;
    const seconds =
      (Date.parse(row.end_time) - Date.parse(row.start_time)) / 1000;
    return total + Math.max(0, seconds);
  }, 0);
}

function groupByDomain(
  rows: { domain: string; duration_seconds: number }[],
): SiteTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.domain, (totals.get(row.domain) ?? 0) + row.duration_seconds);
  }
  return [...totals.entries()]
    .map(([domain, seconds]) => ({ domain, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

function groupCategories(sites: SiteTotal[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const site of sites) {
    const category = categoryFor(site.domain);
    const entry = totals.get(category.name) ?? {
      name: category.name,
      color: category.color,
      seconds: 0,
    };
    entry.seconds += site.seconds;
    totals.set(category.name, entry);
  }
  return [...totals.values()].sort((a, b) => b.seconds - a.seconds);
}

// Seven local-day buckets ending on the selected date (Mon…Sun labels).
function buildWeek(date: string, rows: FocusSession[]): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let offset = -6; offset <= 0; offset++) {
    const day = addDays(date, offset);
    const [year, month, dayOfMonth] = day.split("-").map(Number);
    const weekday = new Date(year, month - 1, dayOfMonth).toLocaleDateString(
      "en-US",
      { weekday: "short" },
    );
    buckets.push({ day, label: weekday, seconds: 0 });
  }
  for (const row of rows) {
    const day = toLocalDateString(new Date(row.start_time));
    const bucket = buckets.find((entry) => entry.day === day);
    if (!bucket || !row.end_time) continue;
    const seconds =
      (Date.parse(row.end_time) - Date.parse(row.start_time)) / 1000;
    bucket.seconds += Math.max(0, seconds);
  }
  return buckets;
}


// ---- chart shapes -------------------------------------------------------
// recharts 3 deprecates <Cell> (removed in recharts 4) in favour of a `shape`
// renderer per item, so each chart paints its own points from its data.
function CategorySector(props: PieSectorShapeProps) {
  const category: CategoryTotal | undefined = props.payload;
  return <Sector {...props} fill={category?.color ?? OTHER_CATEGORY.color} />;
}

// ---- stat cards ---------------------------------------------------------
// Static literals so Tailwind's scanner sees every grid-area class.
const AREA_CLASSES = {
  a: "[grid-area:a]",
  b: "[grid-area:b]",
  c: "[grid-area:c]",
  d: "[grid-area:d]",
  e: "[grid-area:e]",
  f: "[grid-area:f]",
} as const;

// Shared recharts tooltip props (dark panel from the app palette), used by both
// the pie and the week bar chart. `contentStyle.color` only reaches the label:
// recharts paints each payload row with the series colour, which is grey on the
// pie and black on the bar once the colours come from `shape` — so `itemStyle`
// keeps the values readable on the dark panel.
const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "#1D2525",
    border: "1px solid #b8b5ae",
    borderRadius: 8,
    color: "#E4E0D8",
    fontSize: 13,
  },
  itemStyle: { color: "#E4E0D8" },
};

function Card({
  area,
  children,
  className = "",
}: {
  area: keyof typeof AREA_CLASSES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${AREA_CLASSES[area]} rounded-xl border border-[#b8b5ae] bg-[#E4E0D8] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-6 text-center text-[13px] text-[#6b6963]">
      {children}
    </p>
  );
}

function TotalFocusCard({
  seconds,
  loading,
}: {
  seconds: number;
  loading: boolean;
}) {
  return (
    <Card area="a">
      <h1 className="pt-2 text-center text-4xl">Total time spent on task:</h1>
      <h1 className="pt-2 text-center text-9xl tabular-nums">
        {loading ? "—" : formatDuration(seconds)}
      </h1>
    </Card>
  );
}

function SitesCard({
  sites,
  loading,
}: {
  sites: SiteTotal[];
  loading: boolean;
}) {
  return (
    <Card area="b" className="flex flex-col">
      <h1 className="p-4 text-center">Websites used:</h1>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : sites.length === 0 ? (
        <Empty>No browsing time recorded for this day.</Empty>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sites.map((site) => (
            <div
              key={site.domain}
              className="grid w-full grid-cols-2 border-b border-[#b8b5ae]/50 last:border-0"
            >
              <p
                className="truncate p-4 justify-self-start self-center"
                title={site.domain}
              >
                {site.domain}
              </p>
              <p className="p-4 text-2xl tabular-nums justify-self-end self-center">
                {formatDuration(site.seconds)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


function ScoreCard({
  average,
  loading,
}: {
  average: number | null;
  loading: boolean;
}) {
  return (
    <Card area="c">
      <h1 className="p-4 text-center text-xl">Average Focus Score</h1>
      <h1 className="text-center text-6xl tabular-nums">
        {loading ? "—" : average === null ? "—" : `${average.toFixed(1)}/10.0`}
      </h1>
    </Card>
  );
}

function TasksCard({
  count,
  today,
  loading,
}: {
  count: number;
  today: boolean;
  loading: boolean;
}) {
  return (
    <Card area="d">
      <h1 className="p-4 text-center text-xl">
        Tasks Completed{today ? " Today" : ""}
      </h1>
      <h1 className="text-center text-6xl tabular-nums">
        {loading ? "—" : `${count} Task${count === 1 ? "" : "s"}`}
      </h1>
    </Card>
  );
}

function CategoriesCard({
  categories,
  loading,
}: {
  categories: CategoryTotal[];
  loading: boolean;
}) {
  return (
    <Card area="e" className="flex flex-col">
      <h1 className="p-4 text-center text-xl">Time spent in each category</h1>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : categories.length === 0 ? (
        <Empty>No browsing time recorded for this day.</Empty>
      ) : (
        <div className="flex min-h-0 flex-1 gap-2 px-3 pb-3">
          <div className="min-w-0 flex-[3]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="seconds"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="85%"
                  paddingAngle={2}
                  stroke="#E4E0D8"
                  strokeWidth={2}
                  shape={CategorySector}
                />
                <Tooltip
                  {...TOOLTIP_PROPS}
                  formatter={(value) => formatCompact(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-1 flex-col justify-center gap-2 pr-1">
            {categories.map((category) => (
              <li
                key={category.name}
                className="flex items-center justify-between gap-2 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: category.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate">{category.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-[#6b6963]">
                  {formatCompact(category.seconds)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}


function WeekCard({
  week,
  selectedDay,
  loading,
}: {
  week: WeekBucket[];
  selectedDay: string;
  loading: boolean;
}) {
  const hasData = week.some((entry) => entry.seconds > 0);
  return (
    <Card area="f" className="flex flex-col">
      <h1 className="p-4 text-center text-xl">
        Time Spent on Task in past week
      </h1>
      {loading ? (
        <Empty>Loading…</Empty>
      ) : !hasData ? (
        <Empty>No focus sessions in the past week.</Empty>
      ) : (
        <div className="min-h-0 flex-1 px-3 pb-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={week} margin={{ top: 18, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#C9C6C0" />
              <XAxis
                dataKey="label"
                interval={0}
                tickLine={false}
                axisLine={{ stroke: "#b8b5ae" }}
                tick={{ fill: "#1D2525", fontSize: 12 }}
              />
              <Tooltip
                {...TOOLTIP_PROPS}
                cursor={{ fill: "#C9C6C0", fillOpacity: 0.35 }}
                formatter={(value) => [formatCompact(Number(value)), "Focus time"]}
                labelFormatter={(label) =>
                  week.find((entry) => entry.label === label)?.day ??
                  String(label ?? "")
                }
              />
              {/* recharts calls `shape` directly instead of rendering it, so closing
                  over the selected day here is safe. */}
              <Bar
                dataKey="seconds"
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
                shape={(props: BarShapeProps) => (
                  <Rectangle
                    {...props}
                    fill={
                      props.payload?.day === selectedDay ? "#16759b" : "#7CA9BD"
                    }
                  />
                )}
              >
                <LabelList
                  dataKey="seconds"
                  position="top"
                  fill="#6b6963"
                  fontSize={11}
                  formatter={(value) => {
                    const seconds = Number(value);
                    return seconds > 0 ? formatCompact(seconds) : "";
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

