// Shared helpers for the AI chat: where the provider settings live, how the
// chat panel reads them, and how it streams a reply from /api/ai.
//
// The API key is entered in the UI (see app/ui/ai-settings.tsx) and kept in
// localStorage only — it is never written to the repo or to Supabase. Every
// request carries it to the local /api/ai route, which forwards it to the
// provider; the key is not stored server-side.

import { dayRange, toLocalDateString } from "@/app/lib/stats";

export type AiProvider = "openai" | "anthropic" | "gemini";

export type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  // Free-tier budget as "requests-per-day/requests-per-minute" (e.g. "20/5"),
  // or "" to track nothing — see app/lib/quota.ts.
  quota: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

// The user's local day, sent with every chat request: `from`/`to` are local
// midnights as UTC ISO strings (the same bounds the Stats page queries) and
// tzOffset is Date.getTimezoneOffset() (UTC − local, in minutes) — together
// they let the route's data tools compute any day in the user's timezone.
export type ChatDay = { date: string; from: string; to: string; tzOffset: number };

export const AI_SETTINGS_KEY = "momentum.ai.settings";

// Providers are all reached through the same route; only the defaults differ.
// The base URL is editable so OpenAI-compatible gateways (Groq, OpenRouter,
// Ollama, LM Studio, …) work as well. `quota` is the free-tier budget from
// the provider's rate-limit page — Google only publishes it per project (AI
// Studio → Rate limits), so Gemini ships with the numbers this account has
// and the field stays editable.
export const PROVIDER_PRESETS: Record<
  AiProvider,
  { label: string; baseUrl: string; model: string; quota: string }
> = {
  openai: {
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    quota: "",
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
    quota: "",
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.8-flash",
    quota: "20/5",
  },
};

export function isAiConfigured(settings: AiSettings | null): settings is AiSettings {
  return Boolean(
    settings && settings.apiKey.trim() && settings.model.trim() && settings.baseUrl.trim(),
  );
}

// ---- localStorage store (same shape as app/lib/focus.ts) -----------------
// The parsed object is cached so `useSyncExternalStore` sees a stable snapshot
// between renders (it compares snapshots with Object.is).
let cachedRaw: string | null | undefined;
let cachedSettings: AiSettings | null = null;

export function readAiSettings(): AiSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_KEY);
    if (raw === cachedRaw) return cachedSettings;
    cachedRaw = raw;
    cachedSettings = raw ? parseAiSettings(raw) : null;
    return cachedSettings;
  } catch {
    return null;
  }
}

function parseAiSettings(raw: string): AiSettings | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const provider: AiProvider =
      parsed.provider === "anthropic" || parsed.provider === "gemini"
        ? parsed.provider
        : "openai";
    return {
      provider,
      apiKey: String(parsed.apiKey ?? ""),
      baseUrl: String(parsed.baseUrl ?? PROVIDER_PRESETS[provider].baseUrl),
      model: String(parsed.model ?? PROVIDER_PRESETS[provider].model),
      // Settings saved before the quota field existed fall back to the
      // provider's default budget.
      quota:
        typeof parsed.quota === "string"
          ? parsed.quota
          : PROVIDER_PRESETS[provider].quota,
    };
  } catch {
    return null;
  }
}

export function writeAiSettings(settings: AiSettings) {
  window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  emit();
}

export function clearAiSettings() {
  window.localStorage.removeItem(AI_SETTINGS_KEY);
  emit();
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeAiSettings(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === AI_SETTINGS_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- talking to /api/ai -------------------------------------------------
function aiHeaders(settings: AiSettings): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-ai-provider": settings.provider,
    "x-ai-key": settings.apiKey.trim(),
    "x-ai-base-url": settings.baseUrl.trim(),
    "x-ai-model": settings.model.trim(),
    // The free-tier budget for this connection ("20/5" or empty): the route
    // paces requests against it and streams the counter back for the badge.
    "x-ai-quota": settings.quota ?? "",
  };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // fall through to the generic message
  }
  return `The AI request failed (${response.status}).`;
}

// Live quota counter streamed by the route (`data: {"quota":…}` events) when
// the connection declares a free-tier budget.
export type QuotaUsage = { used: number; limit: number; remaining: number };

// A schedule change the model wants to make, awaiting the user's explicit
// approval — mirrors the Generate Schedule review step. The route emits these
// as `data: {"proposal":{...}}` SSE events and the browser renders them as
// Approve/Reject cards; nothing is written until the user clicks Approve,
// which posts the token back to /api/ai/schedule/apply. `index` points into
// the server's stored batch (so the card can approve a subset); the model
// never sees the token or the indices.
export type ScheduleProposalEdit =
  | { type: "add"; title: string; day: number; start_hour: number; duration: number; index: number }
  | { type: "remove"; id: string; title: string; index: number }
  | {
      type: "move";
      id: string;
      title: string;
      day: number;
      start_hour: number;
      duration: number;
      index: number;
    };

export type ScheduleProposal = {
  token: string;
  summary: string;
  edits: ScheduleProposalEdit[];
};

// Streams a reply and calls `onDelta` for every text chunk. The route sends
// `data: {"text":"…"}` lines and finishes with `data: [DONE]`; connections
// with a quota also get `data: {"quota":{used,limit,remaining}}` updates,
// delivered through `onQuota`; schedule edits awaiting approval arrive as
// `data: {"proposal":{...}}` and are delivered through `onScheduleProposal`.
export async function streamChat(
  settings: AiSettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  onQuota?: (usage: QuotaUsage) => void,
  onScheduleProposal?: (proposal: ScheduleProposal) => void,
): Promise<void> {
  // The local-day window: the route's tools read Supabase rows scoped to it.
  const date = toLocalDateString(new Date());
  const day: ChatDay = {
    date,
    ...dayRange(date),
    tzOffset: new Date().getTimezoneOffset(),
  };

  const response = await fetch("/api/ai", {
    method: "POST",
    headers: aiHeaders(settings),
    body: JSON.stringify({ messages, day }),
    signal,
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  if (!response.body) throw new Error("The AI returned an empty response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // The route writes LF-framed SSE, but tolerate CRLF (and any proxy that
    // rewrites line endings) by reading one line at a time.
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      let chunk: {
        text?: string;
        error?: string;
        quota?: QuotaUsage;
        proposal?: ScheduleProposal;
      } | null = null;
      try {
        chunk = JSON.parse(payload) as {
          text?: string;
          error?: string;
          quota?: QuotaUsage;
          proposal?: ScheduleProposal;
        };
      } catch {
        // ignore keep-alives and anything we can't parse
      }
      // Update the badge first so it stays current even when the stream then
      // reports an error (e.g. the daily quota just ran out).
      if (chunk?.quota) onQuota?.(chunk.quota);
      // Schedule edits needing approval surface as cards, not text.
      if (chunk?.proposal) onScheduleProposal?.(chunk.proposal);
      // The route reports failures that happen mid-stream as `error` events.
      if (chunk?.error) throw new Error(chunk.error);
      if (chunk?.text) onDelta(chunk.text);
    }
  }
}

// Cheap round-trip used by the settings dialog's "Test connection" button.
// The route validates the key against the provider's model list — which costs
// no generation quota, unlike sending a test prompt — and answers with
// `modelListed:false` when the key works but the model name doesn't appear in
// it: a typo that would fail every prompt later.
export async function testAiConnection(settings: AiSettings): Promise<void> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: aiHeaders(settings),
    body: JSON.stringify({ ping: true }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  let body: { modelListed?: boolean } | null = null;
  try {
    body = (await response.json()) as { modelListed?: boolean };
  } catch {
    body = null; // no JSON body — treat as a plain success
  }
  if (body?.modelListed === false) {
    throw new Error(
      `Connected, but "${settings.model.trim()}" isn't in the provider's model list — ` +
        `check the spelling.`,
    );
  }
}

// ---- one-shot helpers ------------------------------------------------------
// A route can refuse with a quota attached (e.g. the daily cap just ran
// out): the callers below surface it on the thrown error so the page's badge
// can update even when nothing was generated.
export type AiRequestError = Error & { quota?: QuotaUsage | null };

function withQuota(message: string, quota: QuotaUsage | null | undefined): AiRequestError {
  const error = new Error(message) as AiRequestError;
  if (quota) error.quota = quota;
  return error;
}

type QuotaBody = { error?: string; quota?: QuotaUsage };

export type GeneratedSubgoal = {
  title: string;
  start_date: string;
  target_date: string;
};

// The Goals page's "Generate" button: asks /api/ai/subgoals to break one goal
// into dated subgoal drafts (see the route for the prompt and the date
// clamping). Nothing is written to Supabase here — the caller reviews the
// drafts and inserts the ones the user keeps.
export async function generateSubgoals(
  settings: AiSettings,
  goal: { title: string; start_date: string; target_date: string },
  existingTitles: string[],
): Promise<{ subgoals: GeneratedSubgoal[]; quota: QuotaUsage | null }> {
  const response = await fetch("/api/ai/subgoals", {
    method: "POST",
    headers: aiHeaders(settings),
    body: JSON.stringify({ goal, existing: existingTitles }),
  });
  let body: ({ subgoals?: GeneratedSubgoal[] } & QuotaBody) | null = null;
  try {
    body = (await response.json()) as ({ subgoals?: GeneratedSubgoal[] } & QuotaBody) | null;
  } catch {
    body = null;
  }
  const quota = body?.quota ?? null;
  if (!response.ok) throw withQuota(body?.error ?? `The AI request failed (${response.status}).`, quota);
  const subgoals = Array.isArray(body?.subgoals) ? body.subgoals : [];
  if (subgoals.length === 0) {
    throw withQuota("The AI returned no subgoals — try again.", quota);
  }
  return { subgoals, quota };
}

export type GeneratedEvent = {
  title: string;
  day: number;
  start_hour: number;
  duration: number;
};

// The Schedule page's "Generate schedule" button: asks /api/ai/schedule to
// lay out the week's free time around the existing obligations, events and
// open goals (the route reads those itself). `note` is an optional request
// from the user ("finish the essay before Sunday") folded into the prompt.
// Nothing is written to Supabase here — the caller reviews the drafts and
// inserts the ones the user keeps.
export async function generateSchedule(
  settings: AiSettings,
  note: string,
): Promise<{ events: GeneratedEvent[]; quota: QuotaUsage | null }> {
  const response = await fetch("/api/ai/schedule", {
    method: "POST",
    headers: aiHeaders(settings),
    body: JSON.stringify({ note: note.trim() }),
  });
  let body: ({ events?: GeneratedEvent[] } & QuotaBody) | null = null;
  try {
    body = (await response.json()) as ({ events?: GeneratedEvent[] } & QuotaBody) | null;
  } catch {
    body = null;
  }
  const quota = body?.quota ?? null;
  if (!response.ok) throw withQuota(body?.error ?? `The AI request failed (${response.status}).`, quota);
  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) {
    throw withQuota("The AI returned no calendar events — try again.", quota);
  }
  return { events, quota };
}

export type AppliedScheduleEdits = {
  applied: { added: number; moved: number; removed: number };
  skipped: { title: string; reason: string }[];
  message: string;
};

// Writes an approved chat proposal (/api/ai/schedule/apply). `approvals` are
// the edit indices the user kept. No AI request is made and no quota is
// spent — the single-use token is the authorization, and the route re-checks
// every edit against live rows before touching anything.
export async function applyScheduleEdits(
  token: string,
  approvals: number[],
): Promise<AppliedScheduleEdits> {
  const response = await fetch("/api/ai/schedule/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, approvals }),
  });
  let body: ({ error?: string } & Partial<AppliedScheduleEdits>) | null = null;
  try {
    body = (await response.json()) as ({ error?: string } & Partial<AppliedScheduleEdits>) | null;
  } catch {
    body = null;
  }
  if (!response.ok || !body?.message) {
    throw new Error(body?.error ?? `Couldn't apply the changes (${response.status}).`);
  }
  return {
    applied: body.applied ?? { added: 0, moved: 0, removed: 0 },
    skipped: body.skipped ?? [],
    message: body.message,
  };
}

// ---- calendar change signal (same store pattern as app/lib/focus.ts) ------
// The chat panel's approval cards write through the server, so the calendar
// next to it needs a nudge to refetch. Same-tab listeners fire directly;
// other tabs come through the native storage event, so a change anywhere
// repaints the week everywhere.
export const CALENDAR_REFRESH_KEY = "momentum.calendar.refresh";

type CalendarListener = () => void;
const calendarListeners = new Set<CalendarListener>();

export function notifyCalendarChanged() {
  try {
    window.localStorage.setItem(CALENDAR_REFRESH_KEY, String(Date.now()));
  } catch {
    // storage unavailable — same-tab listeners still fire below
  }
  for (const listener of calendarListeners) listener();
}

export function subscribeCalendarChanges(listener: CalendarListener): () => void {
  calendarListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CALENDAR_REFRESH_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    calendarListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// ---- calendar ghost previews (same listener pattern, in-tab only) ---------
// Approval flows (the chat's proposal card and the Generate Schedule review
// modal) publish what the user is about to accept so the calendar renders
// it as dashed ghosts while the review is open: staged adds appear where
// they would land, and events slated for removal/move fade out. Transient
// local review state — deliberately not synced across tabs. Last writer
// wins if both flows are open at once.
export type CalendarPreviewDraft = {
  title: string;
  day: number;
  start_hour: number;
  duration: number;
};
export type CalendarPreview = {
  drafts: CalendarPreviewDraft[];
  hiddenIds: string[];
};

let calendarPreview: CalendarPreview | null = null;
const calendarPreviewListeners = new Set<() => void>();

export function setCalendarPreview(preview: CalendarPreview | null): void {
  calendarPreview = preview;
  for (const listener of calendarPreviewListeners) listener();
}

export function readCalendarPreview(): CalendarPreview | null {
  return calendarPreview;
}

export function subscribeCalendarPreview(listener: () => void): () => void {
  calendarPreviewListeners.add(listener);
  return () => {
    calendarPreviewListeners.delete(listener);
  };
}


// Reads the live free-tier counter without spending anything (GET
// /api/ai/quota). Null when the connection doesn't declare a budget or the
// route can't be reached — callers treat that as "no badge".
export async function readQuotaUsage(settings: AiSettings): Promise<QuotaUsage | null> {
  try {
    const response = await fetch("/api/ai/quota", {
      method: "GET",
      headers: aiHeaders(settings),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { quota?: QuotaUsage | null } | null;
    return body?.quota ?? null;
  } catch {
    return null;
  }
}

