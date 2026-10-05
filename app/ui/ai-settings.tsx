"use client";

import { useEffect, useState } from "react";
import {
  type AiProvider,
  type AiSettings,
  clearAiSettings,
  PROVIDER_PRESETS,
  readAiSettings,
  testAiConnection,
  writeAiSettings,
} from "@/app/lib/ai";

type Status = { kind: "idle" | "pending" | "ok" | "error"; text: string };

const IDLE: Status = { kind: "idle", text: "" };

function defaultsFor(provider: AiProvider, apiKey = ""): AiSettings {
  return { provider, apiKey, ...PROVIDER_PRESETS[provider] };
}

// Small labelled input used for every field so the dialog stays uniform.
function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block" htmlFor={htmlFor}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[#E4E0D8]/60">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 text-[13px] text-[#E4E0D8] outline-none placeholder:text-[#E4E0D8]/40 focus:border-[#6DBACB]";

// The form is mounted fresh every time the dialog opens, so its initial state
// always matches what is stored — no effect is needed to re-seed it.
export default function AiSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return <AiSettingsForm onClose={onClose} />;
}

function AiSettingsForm({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<AiSettings>(
    () => readAiSettings() ?? defaultsFor("openai"),
  );
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>(IDLE);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const update = (patch: Partial<AiSettings>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const changeProvider = (provider: AiProvider) => {
    // Switching provider reloads that provider's defaults, but keeps the key.
    setDraft((current) =>
      provider === current.provider
        ? current
        : { ...defaultsFor(provider), apiKey: current.apiKey },
    );
    setStatus(IDLE);
  };

  function save() {
    writeAiSettings({
      provider: draft.provider,
      apiKey: draft.apiKey.trim(),
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim(),
    });
    setStatus(IDLE);
    onClose();
  }

  function clear() {
    clearAiSettings();
    setDraft(defaultsFor(draft.provider));
    setStatus({ kind: "ok", text: "Removed the saved key from this browser." });
  }

  async function test() {
    setStatus({ kind: "pending", text: "Testing…" });
    try {
      await testAiConnection({
        provider: draft.provider,
        apiKey: draft.apiKey.trim(),
        baseUrl: draft.baseUrl.trim(),
        model: draft.model.trim(),
      });
      setStatus({ kind: "ok", text: `Connected to ${draft.model.trim()}.` });
    } catch (error) {
      setStatus({ kind: "error", text: (error as Error).message });
    }
  }
  const statusColor =
    status.kind === "error"
      ? "text-[#D26390]"
      : status.kind === "ok"
        ? "text-[#6DBACB]"
        : "text-[#E4E0D8]/70";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      role="dialog"
      aria-modal="true"
      aria-label="Connect an AI"
      onClick={onClose}
    >
      <form
        className="w-[420px] rounded-2xl bg-[#0C425A] p-6 text-[#E4E0D8] shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <h2 className="mb-1 text-2xl font-medium">Connect an AI</h2>
        <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
          Paste an API key for the chat panel. It stays in this browser and is
          only sent to the provider you pick.
        </p>

        <div className="flex flex-col gap-3">
          <Field label="Provider" htmlFor="ai-provider">
            <select
              id="ai-provider"
              value={draft.provider}
              onChange={(event) =>
                changeProvider(event.target.value as AiProvider)
              }
              className={inputClass}
            >
              {(Object.keys(PROVIDER_PRESETS) as AiProvider[]).map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_PRESETS[provider].label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="API key" htmlFor="ai-key">
            <div className="relative">
              <input
                id="ai-key"
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(event) => update({ apiKey: event.target.value })}
                placeholder={
                  draft.provider === "anthropic"
                    ? "sk-ant-…"
                    : draft.provider === "gemini"
                      ? "AIza…"
                      : "sk-…"
                }
                autoComplete="off"
                spellCheck={false}
                className={`${inputClass} pr-16 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowKey((shown) => !shown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] text-[#E4E0D8]/70 hover:bg-white/10 hover:text-[#E4E0D8]"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </Field>

          <Field label="Model" htmlFor="ai-model">
            <input
              id="ai-model"
              value={draft.model}
              onChange={(event) => update({ model: event.target.value })}
              placeholder={PROVIDER_PRESETS[draft.provider].model}
              spellCheck={false}
              className={inputClass}
            />
          </Field>

          <Field
            label="Base URL"
            htmlFor="ai-base-url"
            hint="Any OpenAI-compatible endpoint works — e.g. http://localhost:11434/v1 for Ollama."
          >
            <input
              id="ai-base-url"
              value={draft.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder={PROVIDER_PRESETS[draft.provider].baseUrl}
              spellCheck={false}
              className={inputClass}
            />
          </Field>
        </div>

        {status.text && (
          <p className={`mt-3 text-[13px] ${statusColor}`} role="status">
            {status.text}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg px-3 py-2 text-[13px] text-[#E4E0D8]/70 hover:bg-white/10 hover:text-[#E4E0D8]"
          >
            Clear key
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={test}
              disabled={status.kind === "pending"}
              className="rounded-lg px-4 py-2 text-[14px] hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Test connection
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] text-white hover:bg-[#1b83ad] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB]"
            >
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
