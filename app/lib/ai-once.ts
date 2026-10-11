// One-shot (non-streaming) AI helpers shared by the "generate" routes —
// /api/ai/subgoals and /api/ai/schedule. Each builds a single prompt, wants
// one plain-text generation back, and must count against the same free-tier
// budget as the chat route (app/lib/quota.ts): the pacing/retry loop and the
// tolerant JSON-array reader both live here so the routes stay thin and can't
// drift apart.

import type { ChatMessage } from "@/app/lib/ai";
import {
  extractTextResponse,
  providerError,
  upstreamRequest,
  type ProviderConfig,
} from "@/app/lib/ai-providers";
import {
  parseQuotaLimits,
  refund,
  reserve,
  retryDelayMs,
  sleep,
  usage,
  type QuotaUsage,
} from "@/app/lib/quota";

export type OneShotResult =
  | { ok: true; text: string; quota: QuotaUsage | null }
  | { ok: false; status: number; message: string; quota: QuotaUsage | null };

// The route's JSON error for a failed generation, carrying the quota so the
// browser's badge can update even when the request was refused (e.g. the
// daily cap just ran out).
export function oneShotError(failure: Extract<OneShotResult, { ok: false }>): Response {
  return Response.json(
    { error: failure.message, ...(failure.quota ? { quota: failure.quota } : {}) },
    { status: failure.status },
  );
}

// Sends one non-streaming generation and returns the reply text. Failures
// come back as `{ ok: false, status, message }` so the route can turn them
// into a JSON error without a try/catch around every step.
export async function generateOnce(
  request: Request,
  config: ProviderConfig,
  messages: ChatMessage[],
  system: string,
): Promise<OneShotResult> {
  const { url, init } = upstreamRequest(config, messages, [], system, false, []);

  // Same free-tier pacing as the chat route (see app/lib/quota.ts): reserve a
  // slot before each send, refund it when a 429 proves the request never ran,
  // and give 429s three tries and other 5xx exactly one.
  const quotaKey = `${config.provider}:${config.model}`;
  const quotaLimits = parseQuotaLimits(request.headers.get("x-ai-quota"));
  // Read after every attempt so the badge reflects waits, retries and
  // refunds; null when the connection doesn't track a budget.
  const currentQuota = (): QuotaUsage | null =>
    quotaLimits ? usage(quotaKey, quotaLimits) : null;

  let upstream: Response | null = null;
  let retryBody = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    retryBody = "";
    if (quotaLimits) {
      const verdict = await reserve(quotaKey, quotaLimits);
      if (!verdict.ok) {
        return { ok: false, status: 429, message: verdict.message, quota: currentQuota() };
      }
    }
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      return {
        ok: false,
        status: 502,
        message: `Couldn't reach ${config.baseUrl} — check the base URL. (${(error as Error).message})`,
        quota: currentQuota(),
      };
    }
    const status = response.status;
    const transient = status === 429 || status >= 500;
    const maxAttempts = status === 429 ? 3 : 2;
    if (!transient || attempt + 1 >= maxAttempts) {
      upstream = response;
      break;
    }
    retryBody = await response.text();
    if (status === 429 && quotaLimits) refund(quotaKey);
    await sleep(retryDelayMs(response.headers, retryBody));
  }
  if (!upstream) {
    return { ok: false, status: 502, message: "The provider did not reply.", quota: currentQuota() };
  }
  if (!upstream.ok) {
    const detail = retryBody || (await upstream.text());
    return {
      ok: false,
      status: upstream.status,
      message: providerError(upstream.status, detail),
      quota: currentQuota(),
    };
  }

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return {
      ok: false,
      status: 502,
      message: "The provider returned an unreadable reply.",
      quota: currentQuota(),
    };
  }
  const text = extractTextResponse(config.provider, payload);
  if (!text) {
    return {
      ok: false,
      status: 502,
      message: "The model returned an empty reply — try again.",
      quota: currentQuota(),
    };
  }
  return { ok: true, text, quota: currentQuota() };
}

// The model's reply is usually a bare JSON array, but fenced blocks and a
// sentence of prose around the array are common enough to dig out — a strict
// parse would turn a good plan into "try again". An object wrapper is also
// accepted as long as one of its values is the array ({"subgoals": [...]},
// {"events": [...]}).
export function parseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  const candidates: string[] = [trimmed];
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("[");
  const last = trimmed.lastIndexOf("]");
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const list = Object.values(parsed as Record<string, unknown>).find(Array.isArray);
        if (list) return list;
      }
    } catch {
      // try the next shape
    }
  }
  return null;
}
