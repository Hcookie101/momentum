"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createClient } from "@/supabase/client";
import AiSettingsDialog from "@/app/ui/ai-settings";
import {
  isAiConfigured,
  readAiSettings,
  subscribeAiSettings,
} from "@/app/lib/ai";

const getServerSnapshot = () => null;

type Step = {
  id: "goal" | "obligation" | "ai" | "schedule";
  label: string;
  detail: string;
  href: string;
  action?: "ai-settings";
};

const STEPS: Step[] = [
  { id: "goal", label: "Add a goal", detail: "Something you're working towards, with a date to finish by.", href: "/goals" },
  { id: "obligation", label: "Add an obligation", detail: "The fixed things in your week — classes, workouts, family time.", href: "/obligations" },
  { id: "ai", label: "Connect an AI", detail: "Your own key, kept in this browser. Needed to build a schedule.", href: "/settings", action: "ai-settings" },
  { id: "schedule", label: "Generate a schedule", detail: "The plan lays your goals around the time you actually have.", href: "/schedule" },
];

export default function Onboarding() {
  const [supabase] = useState(() => createClient());
  const settings = useSyncExternalStore(subscribeAiSettings, readAiSettings, getServerSnapshot);
  const aiReady = isAiConfigured(settings);

  const [counts, setCounts] = useState<{ goals: number; obligations: number; events: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const completionStarted = useRef(false);

  useEffect(() => {
    let active = true;

    async function refresh() {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (!active) return;
      if (authError || !user) {
        setError("Couldn't load your getting-started steps.");
        return;
      }

      const [goals, obligations, events, onboarding] = await Promise.all([
        supabase.from("goals").select("id", { count: "exact", head: true }),
        supabase.from("obligations").select("id", { count: "exact", head: true }),
        supabase.from("calendar_events").select("id", { count: "exact", head: true }),
        supabase
          .from("onboarding")
          .select("dismissed_at, completed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (!active) return;
      const queryError = goals.error ?? obligations.error ?? events.error ?? onboarding.error;
      if (queryError) {
        console.error("Couldn't load onboarding state.", queryError);
        setError("Couldn't load your getting-started steps.");
        return;
      }

      let row = onboarding.data;
      if (!row) {
        const { error: insertError } = await supabase
          .from("onboarding")
          .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
        if (insertError) {
          console.error("Couldn't create onboarding state.", insertError);
          setError("Couldn't save your getting-started progress.");
          return;
        }
        const { data, error: readError } = await supabase
          .from("onboarding")
          .select("dismissed_at, completed_at")
          .eq("user_id", user.id)
          .single();
        if (readError) {
          console.error("Couldn't read onboarding state.", readError);
          setError("Couldn't load your getting-started steps.");
          return;
        }
        row = data;
      }

      if (!active) return;
      setUserId(user.id);
      setCounts({
        goals: goals.count ?? 0,
        obligations: obligations.count ?? 0,
        events: events.count ?? 0,
      });
      setDismissed(Boolean(row.dismissed_at));
      setCompleted(Boolean(row.completed_at));
      setError(null);
    }

    const load = () => {
      void refresh()
        .catch((loadError: unknown) => {
          if (!active) return;
          console.error("Couldn't load onboarding state.", loadError);
          setError("Couldn't load your getting-started steps.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    load();

    const refreshOnFocus = () => {
      load();
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [reloadKey, supabase]);

  const allComplete = Boolean(
    counts && counts.goals > 0 && counts.obligations > 0 && counts.events > 0 && aiReady,
  );

  useEffect(() => {
    if (!allComplete || completed || dismissed || !userId || completionStarted.current) return;
    completionStarted.current = true;
    const currentUserId = userId;

    async function saveCompletion() {
      const { error: updateError } = await supabase
        .from("onboarding")
        .update({ completed_at: new Date().toISOString() })
        .eq("user_id", currentUserId);
      if (updateError) {
        console.error("Couldn't save onboarding completion.", updateError);
        setError("Your progress is complete, but it couldn't be saved yet.");
        completionStarted.current = false;
        return;
      }
      setCompleted(true);
      setFinished(true);
    }

    void saveCompletion();
  }, [allComplete, completed, dismissed, supabase, userId]);

  async function dismiss() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("onboarding")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("user_id", userId);
    setBusy(false);
    if (updateError) {
      console.error("Couldn't save onboarding dismissal.", updateError);
      setError("Couldn't save that change. Try again.");
      return;
    }
    setDismissed(true);
  }

  function retry() {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  }

  if (loading) return null;
  if (error && !counts) {
    return (
      <section className="m-3 rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5 sm:m-6" role="status">
        <p className="text-[14px] text-[#6b6963]">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-3 rounded-lg bg-[#16759b] px-3 py-2 text-[13px] text-white hover:bg-[#1b83ad]"
        >
          Try again
        </button>
      </section>
    );
  }
  if (!counts || dismissed || (completed && !finished)) return null;

  if (finished) {
    return (
      <section className="m-3 rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5 sm:m-6" aria-labelledby="onboarding-finished">
        <h2 id="onboarding-finished" className="font-serif text-[17px] font-medium">
          You&apos;ve got a plan
        </h2>
        <p className="mt-1 text-[14px] leading-relaxed text-[#6b6963]">
          Your goals, commitments, and schedule are in place. Adjust things as your week changes.
        </p>
        <button
          type="button"
          onClick={() => setFinished(false)}
          className="mt-4 rounded-lg bg-[#16759b] px-3 py-2 text-[13px] text-white hover:bg-[#1b83ad] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB]"
        >
          Got it
        </button>
      </section>
    );
  }

  const doneCount = Number(counts.goals > 0) + Number(counts.obligations > 0) + Number(aiReady) + Number(counts.events > 0);

  return (
    <>
      <section className="m-3 rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5 sm:m-6" aria-labelledby="onboarding-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="onboarding-title" className="font-serif text-[17px] font-medium">
              A few things to get started
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-[#6b6963]">
              {doneCount} of 4 steps complete. Start with what matters to you; you can come back to the rest.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-[13px] text-[#6b6963] hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16759b] disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>

        {error && <p className="mt-3 text-[13px] text-[#a03a5e]" role="alert">{error}</p>}

        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {STEPS.map((step) => {
            const done = step.id === "goal"
              ? counts.goals > 0
              : step.id === "obligation"
                ? counts.obligations > 0
                : step.id === "ai"
                  ? aiReady
                  : counts.events > 0;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${done ? "border-[#16759b] bg-[#16759b] text-white" : "border-[#8a8780] text-transparent"}`}
                >
                  {done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-medium text-[#1D2525]">
                    {step.label}
                    {done && <span className="text-[11px] font-normal text-[#6b6963]">Done</span>}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-[#6b6963]">
                    {step.detail}
                  </span>
                </span>
              </>
            );
            const className = "flex min-w-0 items-start gap-3 rounded-lg border border-[#b8b5ae]/70 bg-white/30 p-3 text-left transition-colors hover:border-[#16759b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16759b]";

            return (
              <li key={step.id}>
                {step.action === "ai-settings" ? (
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className={`w-full ${className}`}
                    aria-label={`${step.label}${done ? ", complete" : ", incomplete"}`}
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    href={step.href}
                    className={className}
                    aria-label={`${step.label}${done ? ", complete" : ", incomplete"}`}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </section>
      <AiSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
