"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/supabase/client";

type TokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function fmtWhen(iso: string | null) {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ExtensionLinks() {
  const [supabase] = useState(() => createClient());
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("extension_tokens")
      .select("id, label, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) {
      setError("Couldn't load your linked browsers.");
      console.error(error);
    } else {
      setTokens((data ?? []) as TokenRow[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    setNewToken(null);
    setCopied(false);
    const { data, error } = await supabase.rpc("create_extension_token", {
      p_label: label.trim() || "browser",
    });
    setBusy(false);
    if (error || !data) {
      const message =
        (error as { message?: string } | null)?.message ??
        "Couldn't create a token — try again.";
      setError(message);
      console.error(error);
      return;
    }
    // The raw token exists only in this one response — show it once.
    setNewToken(data as string);
    setLabel("");
    await load();
  }

  async function revoke(id: string) {
    setBusy(true);
    const { error } = await supabase
      .from("extension_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(false);
    if (error) {
      setError("Couldn't revoke that token — try again.");
      console.error(error);
      return;
    }
    await load();
  }

  async function copy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable; the token is on screen to copy manually.
    }
  }

  return (
    <section className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5">
      <h2 className="text-[17px] font-medium">Browser extension</h2>
      <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-[#6b6963]">
        Link your Chrome extension so it logs browsing time to <em>your</em>{" "}
        account. Create a token below, then paste it into the extension. It
        only has permission to write your browsing data — nothing else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name this browser (e.g. work laptop)"
          maxLength={40}
          className="w-full max-w-[280px] rounded-lg border border-[#b8b5ae] bg-[#E4E0D8] px-3 py-2 text-[14px] outline-none placeholder:text-[#8a8780] focus:border-[#16759b]"
        />
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Working…" : "Create token"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#D26390]/15 px-3 py-2 text-[13px] text-[#a03a5e]">
          {error}
        </p>
      )}

      {newToken && (
        <div className="mt-4 rounded-lg border border-[#16759b] bg-[#16759b]/10 p-4">
          <p className="text-[13px] font-medium text-[#1D2525]">
            Copy this now — it&apos;s shown only once.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-[#b8b5ae] bg-[#E4E0D8] px-3 py-2 font-mono text-[13px]">
              {newToken}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-lg bg-[#1D2525] px-3 py-2 text-[13px] font-medium text-[#E4E0D8] transition-colors hover:bg-black"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-[#b8b5ae] pt-4">
        <p className="text-[13px] font-medium text-[#6b6963]">Linked browsers</p>
        {loading ? (
          <p className="mt-2 text-[13px] text-[#8a8780]">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="mt-2 text-[13px] text-[#8a8780]">
            None yet — create a token above to link your first browser.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#b8b5ae] border-y border-[#b8b5ae]">
            {tokens.map((t) => {
              const revoked = t.revoked_at !== null;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${revoked ? "bg-[#b8b5ae]" : "bg-[#6DBACB]"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {t.label || "browser"}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[#8a8780]">
                    added {fmtWhen(t.created_at)}
                    {t.last_used_at ? ` · used ${fmtWhen(t.last_used_at)}` : ""}
                  </span>
                  {revoked ? (
                    <span className="shrink-0 text-[12px] text-[#8a8780]">
                      revoked
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => revoke(t.id)}
                      disabled={busy}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] text-[#a03a5e] transition-colors hover:bg-[#D26390]/10 disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

