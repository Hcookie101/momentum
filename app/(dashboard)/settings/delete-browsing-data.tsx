"use client";

import { useState } from "react";
import { createClient } from "@/supabase/client";

type Status = { kind: "idle" | "confirm" | "busy" | "done" | "error"; text: string };

const IDLE: Status = { kind: "idle", text: "" };

// Permanently deletes the signed-in caller's browsing_sessions rows.
// RLS scopes the delete to their own user_id, so no id filter is needed —
// and the two-step confirm keeps an accidental click from wiping history.
export default function DeleteBrowsingData() {
  const [supabase] = useState(() => createClient());
  const [status, setStatus] = useState<Status>(IDLE);

  async function remove() {
    setStatus({ kind: "busy", text: "Deleting…" });
    // Explicit user_id filter: PostgREST refuses unfiltered deletes, and
    // scoping it here documents the intent — RLS enforces it server-side.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStatus({
        kind: "error",
        text: "You're signed out — log back in and try again.",
      });
      return;
    }
    const { error, count } = await supabase
      .from("browsing_sessions")
      .delete({ count: "exact" })
      .eq("user_id", user.id);
    if (error) {
      console.error(error);
      setStatus({
        kind: "error",
        text: "Couldn't delete your browsing data — try again.",
      });
      return;
    }
    setStatus({
      kind: "done",
      text:
        (count ?? 0) === 0
          ? "Done — there was no browsing data to delete."
          : `Done — deleted browsing history (${count} ${count === 1 ? "entry" : "entries"}). Future browsing still logs until you revoke the token above.`,
    });
  }

  return (
    <section className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-5">
      <h2 className="font-serif text-[17px] font-medium">Browsing data</h2>
      <p className="mt-1 max-w-[70ch] text-[14px] leading-relaxed text-[#6b6963]">
        The extension only ever saves the <em>domain</em> and <em>seconds</em>{" "}
        per visit — never full URLs or page contents. Deleting here permanently
        removes every browsing row on your account. Linked browsers keep logging
        until you revoke their token above.
      </p>

      {status.kind === "confirm" ? (
        <div className="mt-4 rounded-lg border border-[#D26390] bg-[#D26390]/10 p-4">
          <p className="text-[14px] font-medium text-[#1D2525]">
            Delete all of your browsing history? This can&apos;t be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={remove}
              className="rounded-lg bg-[#a03a5e] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#86304f]"
            >
              Yes, delete everything
            </button>
            <button
              type="button"
              onClick={() => setStatus(IDLE)}
              className="rounded-lg px-4 py-2 text-[14px] text-[#6b6963] transition-colors hover:bg-black/5 hover:text-[#1D2525]"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setStatus({ kind: "confirm", text: "" })}
          disabled={status.kind === "busy"}
          className="mt-4 rounded-lg border border-[#a03a5e] px-4 py-2 text-[14px] font-medium text-[#a03a5e] transition-colors hover:bg-[#D26390]/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status.kind === "busy" ? "Deleting…" : "Delete my browsing data"}
        </button>
      )}

      {status.kind === "busy" && (
        <p role="status" className="mt-3 text-[13px] text-[#8a8780]">
          Deleting…
        </p>
      )}
      {status.kind === "done" && (
        <p role="status" className="mt-3 rounded-lg bg-[#16759b]/10 px-3 py-2 text-[13px] text-[#16759b]">
          {status.text}
        </p>
      )}
      {status.kind === "error" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p role="alert" className="rounded-lg bg-[#D26390]/15 px-3 py-2 text-[13px] text-[#a03a5e]">
            {status.text}
          </p>
          <button
            type="button"
            onClick={() => setStatus(IDLE)}
            className="rounded-lg px-3 py-2 text-[13px] text-[#6b6963] transition-colors hover:bg-black/5 hover:text-[#1D2525]"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
