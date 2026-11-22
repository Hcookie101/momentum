"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/supabase/client";

export default function DeleteAccount() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeAccount() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.rpc("delete_my_account");
    setBusy(false);
    if (deleteError) {
      console.error(deleteError);
      setError("Couldn't delete your account. Try again.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <section className="rounded-xl border border-[#a03a5e] bg-[#EFECE5] p-5">
      <h2 className="font-serif text-[17px] font-medium">Delete account</h2>
      <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-[#6b6963]">
        Permanently delete your account and Momentum data, including goals,
        schedule events, focus sessions, browsing history, feedback, and linked browsers.
      </p>
      {confirming ? (
        <div className="mt-4 rounded-lg border border-[#D26390] bg-[#D26390]/10 p-4">
          <p className="text-[14px] font-medium">
            Delete your account permanently? This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={removeAccount}
              disabled={busy}
              className="rounded-lg bg-[#a03a5e] px-4 py-2 text-[14px] font-medium text-white disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Yes, delete my account"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-[14px] text-[#6b6963] hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-lg border border-[#a03a5e] px-4 py-2 text-[14px] font-medium text-[#a03a5e] hover:bg-[#D26390]/10"
        >
          Delete my account
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[#D26390]/15 px-3 py-2 text-[13px] text-[#a03a5e]">
          {error}
        </p>
      )}
    </section>
  );
}
