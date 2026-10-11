// Free-tier request budgets for the AI chat: a per-day cap plus a sliding
// per-minute window, tracked in this process's memory. Google still enforces
// the real limits — this only makes them visible (the badge in the chat
// header), paces bursts so a tool chain doesn't trip the per-minute window,
// and replaces a wasted 429 with a friendly, reset-aware message or a wait.
//
// The budget itself is configured per connection ("20/5" in the AI settings,
// sent as the `x-ai-quota` header) because Google publishes free-tier limits
// per project and per model in AI Studio rather than in the docs.

export type QuotaLimits = { rpd: number; rpm: number };
export type QuotaUsage = { used: number; limit: number; remaining: number };

// One bucket per provider+model, since Google's quotas apply per model. The
// map lives on globalThis so every route bundle (chat and one-shot helpers
// like subgoal generation) and every dev-server hot reload shares the same
// counters — a plain module-level Map would reset on HMR and could end up
// duplicated per route.
type Bucket = { day: string; used: number; stamps: number[] };
const buckets: Map<string, Bucket> = ((
  globalThis as typeof globalThis & { __momentumQuotaBuckets?: Map<string, Bucket> }
).__momentumQuotaBuckets ??= new Map());

// Parses a "20/5" budget (requests-per-day / requests-per-minute). Anything
// else — empty, "off", garbage — means "don't track this connection".
export function parseQuotaLimits(raw: string | null | undefined): QuotaLimits | null {
  const match = /^(\d{1,6})\s*\/\s*(\d{1,6})$/.exec((raw ?? "").trim());
  if (!match) return null;
  const rpd = Number(match[1]);
  const rpm = Number(match[2]);
  if (rpd < 1 || rpm < 1) return null;
  return { rpd, rpm: Math.min(rpm, 600) };
}

// Google resets the daily quota at midnight Pacific — keying the day on that
// zone keeps the counter and the "resets at" message in line with AI Studio.
function pacificDay(at: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

// The next Pacific midnight, found by stepping hour by hour until the
// Pacific date changes — exact across DST without timezone math by hand
// (Pacific offsets are whole hours, so hourly steps can't overshoot it).
function nextPacificMidnight(now: number): Date {
  const today = pacificDay(now);
  let at = Math.ceil(now / 3_600_000) * 3_600_000;
  for (let hour = 0; hour <= 48; hour++) {
    if (pacificDay(at) !== today) return new Date(at);
    at += 3_600_000;
  }
  return new Date(now + 86_400_000);
}

function resetLabel(now: number): string {
  try {
    return nextPacificMidnight(now).toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "midnight Pacific";
  }
}

function bucketFor(key: string): Bucket {
  const day = pacificDay(Date.now());
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { day, used: 0, stamps: [] };
    buckets.set(key, bucket);
  } else if (bucket.day !== day) {
    bucket.day = day;
    bucket.used = 0;
    bucket.stamps = [];
  }
  return bucket;
}

export function usage(key: string, limits: QuotaLimits): QuotaUsage {
  const bucket = bucketFor(key);
  return {
    used: bucket.used,
    limit: limits.rpd,
    remaining: Math.max(0, limits.rpd - bucket.used),
  };
}

// Books the next upstream request: refuses once the daily cap is reached
// (before anything is spent — Google would only reject it anyway) and waits
// out the per-minute window instead of firing into a guaranteed 429.
// Callers `refund()` when the provider rejects the request with a 429.
export async function reserve(
  key: string,
  limits: QuotaLimits,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const bucket = bucketFor(key);
  if (bucket.used >= limits.rpd) {
    return {
      ok: false,
      message:
        `The daily request quota is used up for this model (${bucket.used}/${limits.rpd} ` +
        `today). It resets at ${resetLabel(Date.now())} — change the free-tier quota in the ` +
        `AI settings if your plan allows more.`,
    };
  }

  const cutoff = Date.now() - 60_000;
  bucket.stamps = bucket.stamps.filter((at) => at > cutoff);
  if (bucket.stamps.length >= limits.rpm) {
    await sleep(bucket.stamps[0] + 60_000 - Date.now());
    const afterWaiting = Date.now() - 60_000;
    bucket.stamps = bucket.stamps.filter((at) => at > afterWaiting);
  }
  bucket.stamps.push(Date.now());
  bucket.used += 1;
  return { ok: true };
}

// A 429 means Google never processed the request, so give the day's count
// (and the minute's slot) back before waiting to retry. Stamps are pushed
// and popped in order — the chat loop reserves one request at a time.
export function refund(key: string): void {
  const bucket = bucketFor(key);
  bucket.used = Math.max(0, bucket.used - 1);
  bucket.stamps.pop();
}

// How long a 429 asks us to wait: the standard `retry-after` header, then
// Gemini's `RetryInfo.retryDelay` ("13s"), then one per-minute slot as a
// fallback. Capped at a minute so a bad response can't stall the chat.
export function retryDelayMs(headers: Headers, body: string): number {
  const cap = (ms: number) => Math.min(60_000, Math.max(500, ms));
  const header = headers.get("retry-after");
  if (header && /^\d+(\.\d+)?$/.test(header.trim())) {
    return cap(parseFloat(header) * 1000 + 400);
  }
  try {
    const parsed = JSON.parse(body) as { error?: { details?: { retryDelay?: unknown }[] } };
    for (const detail of parsed.error?.details ?? []) {
      const delay = detail?.retryDelay;
      if (typeof delay === "string") {
        const match = /^\s*([\d.]+)\s*s?\s*$/.exec(delay);
        if (match) return cap(parseFloat(match[1]) * 1000 + 400);
      }
    }
  } catch {
    // not a JSON body — fall through to the default below
  }
  return 12_500;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
