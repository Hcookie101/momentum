// Helpers for the Stats page: day boundaries, duration formatting and the
// domain → category classifier used by the "Time spent in each category" card.

// Local midnight bounds for a `YYYY-MM-DD` date, as ISO strings for
// timestamptz comparisons against focus_sessions / browsing_sessions.
export function dayRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split("-").map(Number);
  const from = new Date(year, month - 1, day, 0, 0, 0, 0);
  const to = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Shift a `YYYY-MM-DD` date by whole days (local, DST-safe).
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(year, month - 1, day + days, 12, 0, 0, 0);
  return toLocalDateString(d);
}

// "04h32m" — the same style used across the site and extension popup.
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor((totalSeconds + 30) / 60);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}h${String(mins).padStart(2, "0")}m`;
}

// Shorter label for chart axes: "4h03m" (or "<1m" for sub-minute spans).
export function formatCompact(totalSeconds: number): string {
  const minutes = Math.floor((totalSeconds + 30) / 60);
  if (minutes === 0) return totalSeconds > 0 ? "<1m" : "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

// ---- Domain → category classifier (heuristic, easy to extend) ----
export type Category = { name: string; color: string; hosts: string[] };

export const CATEGORIES: Category[] = [
  {
    name: "Work",
    color: "#7CA9BD",
    hosts: [
      "github", "gitlab", "bitbucket", "stackoverflow", "slack", "notion",
      "jira", "linear", "gmail", "outlook", "calendar", "drive", "docs",
      "figma", "localhost", "vercel", "netlify", "aws", "azure", "google",
      "linkedin", "trello", "asana",
    ],
  },
  {
    name: "Entertainment",
    color: "#D26390",
    hosts: ["youtube", "netflix", "twitch", "tiktok", "spotify", "hulu", "disney", "primevideo", "reddit"],
  },
  {
    name: "Social",
    color: "#F5E573",
    hosts: ["twitter", "instagram", "facebook", "discord", "threads", "bsky", "snapchat", "messenger"],
  },
  {
    name: "Shopping",
    color: "#16759b",
    hosts: ["amazon", "ebay", "etsy", "walmart", "target", "aliexpress", "shopify"],
  },
];

export const OTHER_CATEGORY: Category = { name: "Other", color: "#b8b5ae", hosts: [] };

// Match whole labels of the domain ("mail.google.com" → "google" matches),
// so e.g. "max.com" never matches the host "x.com".
export function categoryFor(domain: string): Category {
  const labels = domain.split(".");
  for (const category of CATEGORIES) {
    if (category.hosts.some((host) => labels.includes(host))) return category;
  }
  return OTHER_CATEGORY;
}
