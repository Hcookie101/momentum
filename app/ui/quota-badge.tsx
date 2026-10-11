import type { QuotaUsage } from "@/app/lib/ai";

// "3/20 today" — the free-tier counter shared by the chat, the subgoal
// generator and the schedule generator (same per-model bucket on the server,
// resets at midnight Pacific). Matches the chat header's badge, restyled for
// the light pages.
export default function QuotaBadge({ usage }: { usage: QuotaUsage | null }) {
  if (!usage) return null;
  return (
    <span
      className={`text-[11px] tabular-nums ${usage.remaining === 0 ? "text-[#D26390]" : "text-[#6b6963]"}`}
      title="AI requests used today against your free-tier quota (resets at midnight Pacific)"
    >
      {usage.used}/{usage.limit} today
    </span>
  );
}
