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
// Ollama, LM Studio, …) work as well.
export const PROVIDER_PRESETS: Record<
  AiProvider,
  { label: string; baseUrl: string; model: string }
> = {
  openai: {
    label: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  anthropic: {
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
  gemini: {
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-3.8-flash",
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

// Streams a reply and calls `onDelta` for every text chunk. The route sends
// `data: {"text":"…"}` lines and finishes with `data: [DONE]`.
export async function streamChat(
  settings: AiSettings,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
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
      let chunk: { text?: string; error?: string } | null = null;
      try {
        chunk = JSON.parse(payload) as { text?: string; error?: string };
      } catch {
        // ignore keep-alives and anything we can't parse
      }
      // The route reports failures that happen mid-stream as `error` events.
      if (chunk?.error) throw new Error(chunk.error);
      if (chunk?.text) onDelta(chunk.text);
    }
  }
}

// Cheap round-trip used by the settings dialog's "Test connection" button.
export async function testAiConnection(settings: AiSettings): Promise<void> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: aiHeaders(settings),
    body: JSON.stringify({ ping: true }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
}
