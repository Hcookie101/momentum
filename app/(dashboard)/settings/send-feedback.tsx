"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/supabase/client";

const CATEGORIES = [
  { value: "idea", label: "Idea" },
  { value: "problem", label: "Problem" },
  { value: "other", label: "Other" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const MAX_LENGTH = 2000;

// Collects short written feedback from the signed-in user. The insert goes
// straight through the browser client — RLS scopes the row to auth.uid() so
// a caller can only file feedback as themselves (mirrors the settings pattern
// used by DeleteBrowsingData). The page column stores only the app route.
export default function SendFeedback() {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();
  const [category, setCategory] = useState<Category>("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Guard against double-submit while the insert is in flight.
    if (busy) return;
    if (!trimmed) {
      setError("Write a few words first — the message can't be empty.");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Keep it under ${MAX_LENGTH} characters — yours is ${trimmed.length}.`);
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You're signed out — log back in and try again.");
        return;
      }
      const { error: insertError } = await supabase.from("feedback").insert({
        user_id: user.id,
        category,
        message: trimmed,
        page: pathname,
      });
      if (insertError) throw insertError;
      setMessage("");
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("Couldn't send your feedback — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5">
      <h2 className="font-serif text-[17px] font-medium">Send feedback</h2>
      <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-[#6b6963]">
        Ideas, problems, or anything you want changed. A sentence or two is plenty.
        We read every note. 
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Type</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                aria-pressed={category === c.value}
                className={`rounded-lg border px-3 py-1.5 text-[13px] transition-colors ${
                  category === c.value
                    ? "border-[#16759b] bg-[#16759b]/10 font-medium text-[#1D2525]"
                    : "border-[#b8b5ae] text-[#6b6963] hover:bg-black/5 hover:text-[#1D2525]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="feedback-message" className="mb-1.5 block text-[13px] font-medium">
            Feedback
          </label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX_LENGTH}
            rows={4}
            placeholder="What's on your mind?"
            className="w-full resize-none rounded-lg border border-[#b8b5ae] bg-[#E4E0D8] px-3 py-2 text-[14px] text-[#1D2525] outline-none placeholder:text-[#8a8780] focus:border-[#16759b]"
          />
          <p className="mt-1 text-right text-[12px] tabular-nums text-[#8a8780]">
            {trimmed.length}/{MAX_LENGTH}
          </p>
        </div>

        <button
          type="submit"
          disabled={busy || !trimmed}
          className="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Sending…" : "Send feedback"}
        </button>
      </form>

      {done && (
        <p role="status" className="mt-3 rounded-lg bg-[#16759b]/10 px-3 py-2 text-[13px] text-[#16759b]">
          Thanks — your feedback was sent.
        </p>
      )}
      {error && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="rounded-lg bg-[#D26390]/15 px-3 py-2 text-[13px] text-[#a03a5e]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-lg px-3 py-2 text-[13px] text-[#6b6963] transition-colors hover:bg-black/5 hover:text-[#1D2525]"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
