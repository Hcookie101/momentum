"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type JournalEntry = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

const STORAGE_KEY = "momentum-journal-entries";
const STORAGE_UNAVAILABLE = "__momentum_journal_storage_unavailable__";
const JOURNAL_CHANGED_EVENT = "momentum-journal-storage-change";

function isJournalEntry(value: unknown): value is Omit<JournalEntry, "title"> & {
  title?: string;
} {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.content === "string" &&
    (entry.title === undefined || typeof entry.title === "string") &&
    typeof entry.createdAt === "string" &&
    !Number.isNaN(Date.parse(entry.createdAt))
  );
}

function getJournalSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return STORAGE_UNAVAILABLE;
  }
}

function getServerJournalSnapshot() {
  return null;
}

function subscribeToJournal(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(JOURNAL_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(JOURNAL_CHANGED_EVENT, listener);
  };
}

function parseEntries(snapshot: string): JournalEntry[] | null {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed) || !parsed.every(isJournalEntry)) return null;
    return parsed.map((entry) => ({
      ...entry,
      title: entry.title?.trim() || "Untitled entry",
    }));
  } catch {
    return null;
  }
}

function formatEntryDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function JournalEntryDialog({
  entry,
  onClose,
}: {
  entry: JournalEntry;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.showModal();
    closeButtonRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="journal-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[min(85dvh,48rem)] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl border border-[#b8b5ae] bg-[#F8F6F1] p-0 text-[#1D2525] shadow-2xl backdrop:bg-[#1D2525]/55"
    >
      <div className="flex max-h-[min(85dvh,48rem)] flex-col">
        <header className="border-b border-[#d1cec7] bg-[#EFECE5] px-5 py-5 sm:px-8 sm:py-7">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6b6963]">
                Journal entry
              </p>
              <h2
                id="journal-dialog-title"
                className="mt-2 wrap-break-word font-serif text-[25px] font-medium leading-tight tracking-tight sm:text-[32px]"
              >
                {entry.title}
              </h2>
              <time
                dateTime={entry.createdAt}
                className="mt-2 block text-[13px] text-[#6b6963]"
              >
                {formatEntryDate(entry.createdAt)}
              </time>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close journal entry"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[22px] leading-none text-[#6b6963] transition-colors hover:bg-black/5 hover:text-[#1D2525] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b]"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </header>
        <article className="overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <p className="mx-auto max-w-[68ch] whitespace-pre-wrap wrap-break-word text-[15px] leading-[1.85] text-[#1D2525] sm:text-[16px]">
            {entry.content}
          </p>
            <p className="mt-1 text-right text-[12px] tabular-nums text-[#8a8780]">
            {entry.content.split(/\s+/).filter(Boolean).length} words
          </p>
        </article>
       
        <footer className="border-t border-[#d1cec7] px-5 py-3 text-center text-[12px] text-[#8a8780] sm:px-8">
          Stored in this browser profile only
        </footer>
      </div>
    </dialog>
  );
}

export default function JournalPage() {
  const snapshot = useSyncExternalStore(
    subscribeToJournal,
    getJournalSnapshot,
    getServerJournalSnapshot,
  );
  const entries =
    snapshot !== null && snapshot !== STORAGE_UNAVAILABLE
      ? parseEntries(snapshot)
      : null;
  const storageError =
    snapshot === STORAGE_UNAVAILABLE
      ? "Your browser couldn't access local storage. Your journal hasn't been changed."
      : snapshot !== null && entries === null
        ? "Your saved journal data couldn't be read. It has been left untouched."
        : null;
  const storageReady = entries !== null;
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const error = writeError ?? storageError;

  function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const content = draft.trim();
    if (!trimmedTitle || !content || !entries) return;

    const nextEntries = [
      {
        id: window.crypto.randomUUID(),
        title: trimmedTitle,
        content,
        createdAt: new Date().toISOString(),
      },
      ...entries,
    ];

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
      window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT));
      setSelectedEntry(null);
      setTitle("");
      setDraft("");
      setWriteError(null);
      setNotice("Entry saved on this device.");
    } catch (saveError) {
      console.error("Failed to save local journal:", saveError);
      setWriteError("Couldn't save this entry in your browser. Your draft is still here.");
      setNotice(null);
    }
  }

  function deleteEntry(id: string) {
    if (!entries) return;
    if (!window.confirm("Delete this journal entry? This can't be undone.")) return;
    const nextEntries = entries.filter((entry) => entry.id !== id);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextEntries));
      window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT));
      setWriteError(null);
    } catch (deleteError) {
      console.error("Failed to delete local journal entry:", deleteError);
      setWriteError("Couldn't update your journal in this browser. Please try again.");
    }
  }

  return (
    <main className="min-h-[calc(100vh-40px)] bg-[#C9C6C0] px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 border-b border-[#b8b5ae] pb-5 sm:mb-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#6b6963]">
            A little space for yourself
          </p>
          <h1 className="mt-1 font-serif text-[30px] font-medium leading-tight tracking-tight text-[#1D2525] sm:text-[36px]">
            Journal
          </h1>
          <p className="mt-2 max-w-[65ch] text-[14px] leading-relaxed text-[#6b6963]">
            Capture a thought, reflect on your day, or just get it out of your
            head. Entries stay in this browser on this device.
          </p>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#a03a5e]/40 bg-[#f7e9ed] px-4 py-3 text-[13px] text-[#713047]"
          >
            <p>{error}</p>
            {storageError && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(JOURNAL_CHANGED_EVENT))}
                className="shrink-0 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b]"
              >
                Try again
              </button>
            )}
          </div>
        )}
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)]">
          <section className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-[19px] font-medium text-[#1D2525]">
                  New entry
                </h2>
                <p className="mt-0.5 text-[13px] text-[#6b6963]">
                  This is just for you.
                </p>
              </div>
              <span aria-hidden="true" className="text-[22px] text-[#16759b]">
                ✳
              </span>
            </div>

            <form onSubmit={saveEntry}>
              <label
                htmlFor="journal-title"
                className="mb-1.5 block text-[13px] font-medium text-[#1D2525]"
              >
                Title
              </label>
              <input
                id="journal-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setNotice(null);
                }}
                maxLength={100}
                required
                placeholder="Give this entry a title"
                className="mb-4 w-full rounded-lg border border-[#b8b5ae] bg-[#F8F6F1] px-4 py-2.5 text-[14px] text-[#1D2525] outline-none placeholder:text-[#8a8780] focus:border-[#16759b] focus:ring-2 focus:ring-[#16759b]/15"
              />
              <label
                htmlFor="journal-entry"
                className="mb-1.5 block text-[13px] font-medium text-[#1D2525]"
              >
                Your entry
              </label>
              <textarea
                id="journal-entry"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setNotice(null);
                }}
                rows={10}
                placeholder="Start wherever you are..."
                className="min-h-56 w-full resize-y rounded-lg border border-[#b8b5ae] bg-[#F8F6F1] px-4 py-3 text-[14px] leading-relaxed text-[#1D2525] outline-none placeholder:text-[#8a8780] focus:border-[#16759b] focus:ring-2 focus:ring-[#16759b]/15"
              />
               <p className="mt-1 text-right text-[12px] tabular-nums text-[#8a8780]">
            {draft.split(/\s+/).filter(Boolean).length} words
          </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] text-[#8a8780]">
                    Stored in this browser profile only; it isn’t synced to your
                    account. Anyone with access to this profile may be able to
                    read it.
                  </p>
                  {notice && (
                    <p role="status" className="mt-1 text-[12px] font-medium text-[#16759b]">
                      {notice}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!storageReady || !title.trim() || !draft.trim()}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save entry
                </button>
              </div>
            </form>
          </section>

          <section
            aria-labelledby="saved-entries-heading"
            className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-4 sm:p-6"
          >
            <div className="flex items-baseline justify-between gap-3 border-b border-[#d1cec7] pb-3">
              <h2
                id="saved-entries-heading"
                className="font-serif text-[19px] font-medium text-[#1D2525]"
              >
                Your entries
              </h2>
              <span className="text-[12px] text-[#8a8780]">
                {storageReady ? entries.length : "—"}
              </span>
            </div>

            {snapshot === null ? (
              <p className="py-6 text-[13px] leading-relaxed text-[#6b6963]">
                Reading your entries from this browser…
              </p>
            ) : !storageReady ? (
              <p className="py-6 text-[13px] leading-relaxed text-[#6b6963]">
                Your entries aren’t available right now.
              </p>
            ) : entries.length === 0 ? (
              <div className="py-8 text-center">
                <p className="font-serif text-[16px] text-[#1D2525]">
                  A blank page, for now.
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#6b6963]">
                  Your saved reflections will show up here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#d1cec7]">
                {entries.map((entry) => (
                  <li key={entry.id} className="py-3 first:pt-4">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setSelectedEntry(entry)}
                          className="block max-w-full truncate rounded font-serif text-[16px] font-medium text-[#1D2525] hover:text-[#16759b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b]"
                        >
                          {entry.title}
                        </button>
                        <time
                          dateTime={entry.createdAt}
                          className="mt-0.5 block text-[12px] font-medium text-[#6b6963]"
                        >
                          {formatEntryDate(entry.createdAt)}
                        </time>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteEntry(entry.id)}
                        aria-label={`Delete “${entry.title}”`}
                        className="rounded px-1.5 py-1 text-[12px] text-[#8a8780] transition-colors hover:bg-[#a03a5e]/10 hover:text-[#a03a5e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b]"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      {selectedEntry && (
        <JournalEntryDialog
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </main>
  );
}
