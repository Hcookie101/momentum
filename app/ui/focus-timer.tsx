"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/supabase/client";
import {
  clearFocusStart,
  elapsedSeconds,
  readFocusStart,
  subscribeFocusStart,
  writeFocusStart,
} from "@/app/lib/focus";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const mm = String(mins).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

// SSR has no localStorage — render idle during hydration, then React picks up
// the persisted session without a setState-in-effect restore.
const getServerSnapshot = () => null;

export default function FocusTimer() {
  const [supabase] = useState(() => createClient());
  // localStorage is the source of truth for the running session; writes notify
  // subscribers (same tab via emit(), other tabs via the native storage event).
  const startISO = useSyncExternalStore(
    subscribeFocusStart,
    readFocusStart,
    getServerSnapshot,
  );
  const [, setTick] = useState(0);
  const [stoppedSession, setStoppedSession] = useState<{
    startISO: string;
    endISO: string;
  } | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-render every second while a session runs so the elapsed label updates.
  useEffect(() => {
    if (!startISO || stoppedSession) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(id);
  }, [startISO, stoppedSession]);

  function start() {
    writeFocusStart(new Date().toISOString());
    setError(null);
  }

  function stop() {
    if (!startISO) return;
    // Keep the stored start so a reload during the prompt can't lose the session.
    setStoppedSession({ startISO, endISO: new Date().toISOString() });
    setScore(null);
    setError(null);
  }

  function resume() {
    setStoppedSession(null);
    setScore(null);
    setError(null);
  }

  function discard() {
    clearFocusStart();
    setStoppedSession(null);
    setScore(null);
    setError(null);
  }

  async function save() {
    if (!stoppedSession || score === null || saving) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("focus_sessions").insert({
      start_time: stoppedSession.startISO,
      end_time: stoppedSession.endISO,
      focus_score: score,
    });
    setSaving(false);
    if (insertError) {
      console.error(insertError);
      setError("Couldn't save the session. Try again.");
      return;
    }
    clearFocusStart();
    setStoppedSession(null);
    setScore(null);
  }

  const elapsed = startISO ? elapsedSeconds(startISO) : 0;
  const running = startISO !== null && !stoppedSession;
  const sessionPrompt = stoppedSession !== null;

  return (
    <>
      {running ? (
        <div className="flex items-center gap-2 rounded-lg border border-[#6DBACB] bg-[#16759b] py-1 pl-2.5 pr-1.5 text-white">
          <span
            className="h-2 w-2 rounded-full bg-[#6DBACB]"
            aria-hidden="true"
          />
          <span className="min-w-[52px] text-center text-[13px] font-semibold tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label="Stop focus session"
            className="rounded-md bg-white/15 px-2 py-1 text-[12px] font-medium transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB]"
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          className="flex items-center gap-1.5 rounded-lg bg-[#7CA9BD] px-3 py-1 text-[13px] font-medium text-[#1D2525] shadow-sm transition-transform hover:scale-105 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1D2525]"
        >
          Start focus
        </button>
      )}

      {sessionPrompt && stoppedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          role="dialog"
          aria-modal="true"
          aria-label="Rate your focus"
        >
          <div className="w-[400px] rounded-2xl bg-[#0C425A] p-6 text-[#E4E0D8] shadow-xl">
            <h2 className="mb-1 text-2xl font-medium">Rate your focus</h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              {formatElapsed(
                elapsedSeconds(
                  stoppedSession.startISO,
                  Date.parse(stoppedSession.endISO),
                ),
              )}{" "}
              session · How focused were you (0–10)?
            </p>

            <div className="mb-4 grid grid-cols-6 gap-2">
              {Array.from({ length: 11 }, (_, i) => i).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScore(value)}
                  className={`h-9 rounded-lg border text-[14px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB] ${
                    score === value
                      ? "border-[#6DBACB] bg-[#16759b] text-white"
                      : "border-[#777] text-[#E4E0D8]/70 hover:bg-white/10"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            {error && <p className="mb-3 text-[13px] text-[#D26390]">{error}</p>}

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={discard}
                className="rounded-lg px-3 py-2 text-[14px] text-[#E4E0D8]/70 hover:bg-white/10 hover:text-[#E4E0D8]"
              >
                Discard
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resume}
                  className="rounded-lg px-4 py-2 hover:bg-white/10"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={score === null || saving}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save session"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}