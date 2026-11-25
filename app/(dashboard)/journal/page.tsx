"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type JournalEntry = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
};

const LEGACY_STORAGE_KEY = "momentum-journal-entries";
const DATABASE_NAME = "momentum-journal";
const DATABASE_VERSION = 2;
const ENTRY_STORE = "entries";
const METADATA_STORE = "metadata";
const LEGACY_MIGRATION_KEY = "legacy-localstorage-migrated";
const JOURNAL_CHANNEL_NAME = "momentum-journal-updates";
const MAX_BACKUP_SIZE = 25 * 1024 * 1024;
const BACKUP_FORMAT = "momentum-journal-backup";

type StoredJournalEntry = Omit<JournalEntry, "title"> & { title?: string };
type JournalSnapshot = {
  entries: JournalEntry[] | null;
  error: string | null;
};

const EMPTY_SNAPSHOT: JournalSnapshot = { entries: null, error: null };
let journalSnapshot = EMPTY_SNAPSHOT;
let databasePromise: Promise<IDBDatabase> | null = null;
let journalLoadPromise: Promise<void> | null = null;
let journalRefreshRequested = false;
let journalChannel: BroadcastChannel | null = null;
const journalListeners = new Set<() => void>();

function isJournalEntry(value: unknown): value is StoredJournalEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.trim().length > 0 &&
    typeof entry.content === "string" &&
    (entry.title === undefined || typeof entry.title === "string") &&
    typeof entry.createdAt === "string" &&
    !Number.isNaN(Date.parse(entry.createdAt))
  );
}

function normalizeJournalEntries(values: unknown): JournalEntry[] | null {
  if (!Array.isArray(values) || !values.every(isJournalEntry)) return null;
  return values.map((entry) => ({
    id: entry.id,
    title: entry.title?.trim() || "Untitled entry",
    content: entry.content,
    createdAt: entry.createdAt,
  }));
}

function parseJournalBackup(contents: string): JournalEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("This file isn't a Momentum journal backup.");
  }

  const backup = parsed as Record<string, unknown>;
  if (backup.format !== BACKUP_FORMAT || backup.version !== 1) {
    throw new Error("This file isn't a supported Momentum journal backup.");
  }

  const entries = normalizeJournalEntries(backup.entries);
  if (!entries) {
    throw new Error("The backup contains invalid journal entries.");
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    throw new Error("The backup contains duplicate entry IDs and can't be imported.");
  }
  return entries;
}

function getSnapshot() {
  return journalSnapshot;
}

function getServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

function publishSnapshot(snapshot: JournalSnapshot) {
  journalSnapshot = snapshot;
  journalListeners.forEach((listener) => listener());
}

function openJournalDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("This browser does not support IndexedDB."));
  }
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ENTRY_STORE)) {
        database.createObjectStore(ENTRY_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(METADATA_STORE)) {
        database.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error ?? new Error("Couldn't open the journal database."));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error("Close other Momentum tabs to finish opening your journal."));
    };
  });
  databasePromise = opening.catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(request.error ?? new Error("The journal database request failed."));
    };
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("The journal database transaction was aborted."));
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("The journal database transaction failed."));
    };
  });
}

async function readJournalEntries(database: IDBDatabase): Promise<JournalEntry[]> {
  const transaction = database.transaction(ENTRY_STORE, "readonly");
  const complete = transactionComplete(transaction);
  const [stored] = await Promise.all([
    requestResult<unknown[]>(transaction.objectStore(ENTRY_STORE).getAll()),
    complete,
  ]);

  const entries = normalizeJournalEntries(stored);
  if (!entries) {
    throw new Error("The journal database contains invalid entry data.");
  }
  return entries.sort(
    (first, second) =>
      Date.parse(second.createdAt) - Date.parse(first.createdAt),
  );
}

async function migrateLegacyEntries(database: IDBDatabase): Promise<string | null> {
  const metadataTransaction = database.transaction(METADATA_STORE, "readonly");
  const metadataComplete = transactionComplete(metadataTransaction);
  const [migrationRecord] = await Promise.all([
    requestResult<{ key: string } | undefined>(
      metadataTransaction.objectStore(METADATA_STORE).get(LEGACY_MIGRATION_KEY),
    ),
    metadataComplete,
  ]);
  if (migrationRecord) {
    try {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    } catch (error) {
      console.error("Could not remove the old journal copy:", error);
      return "Your entries were copied, but the old local copy couldn't be removed.";
    }
  }

  const legacyData = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyData === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyData);
  } catch {
    throw new Error(
      "Your existing journal data couldn't be read, so it was left untouched.",
    );
  }
  const entries = normalizeJournalEntries(parsed);
  if (!entries) {
    throw new Error(
      "Your existing journal data has an unexpected format, so it was left untouched.",
    );
  }

  const transaction = database.transaction(
    [ENTRY_STORE, METADATA_STORE],
    "readwrite",
  );
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(ENTRY_STORE);
  for (const entry of entries) store.put(entry);
  transaction.objectStore(METADATA_STORE).put({
    key: LEGACY_MIGRATION_KEY,
    completedAt: new Date().toISOString(),
  });
  await complete;

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return null;
  } catch (error) {
    console.error("Migrated journal data, but could not remove the old copy:", error);
    return "Your entries were copied, but the old local copy couldn't be removed.";
  }
}

async function refreshJournal() {
  if (journalLoadPromise) {
    journalRefreshRequested = true;
    return journalLoadPromise;
  }

  journalLoadPromise = (async () => {
    do {
      journalRefreshRequested = false;
      try {
        const database = await openJournalDatabase();
        const migrationWarning = await migrateLegacyEntries(database);
        const entries = await readJournalEntries(database);
        publishSnapshot({ entries, error: migrationWarning });
      } catch (error) {
        console.error("Failed to load local journal:", error);
        publishSnapshot({
          entries: null,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't load your journal from this browser.",
        });
      }
    } while (journalRefreshRequested);
  })().finally(() => {
    journalLoadPromise = null;
  });

  return journalLoadPromise;
}

function subscribeToJournal(listener: () => void) {
  journalListeners.add(listener);
  if (typeof BroadcastChannel !== "undefined" && !journalChannel) {
    journalChannel = new BroadcastChannel(JOURNAL_CHANNEL_NAME);
    journalChannel.onmessage = () => {
      if (journalSnapshot.entries === null) void refreshJournal();
    };
  }
  void refreshJournal();
  return () => {
    journalListeners.delete(listener);
  };
}

function announceJournalChange() {
  journalChannel?.postMessage("changed");
}

async function writeJournalEntry(entry: JournalEntry) {
  const database = await openJournalDatabase();
  const transaction = database.transaction(ENTRY_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  transaction.objectStore(ENTRY_STORE).put(entry);
  await complete;
}

async function removeJournalEntry(id: string) {
  const database = await openJournalDatabase();
  const transaction = database.transaction(ENTRY_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  transaction.objectStore(ENTRY_STORE).delete(id);
  await complete;
}

async function mergeJournalEntries(
  importedEntries: JournalEntry[],
): Promise<{ entries: JournalEntry[]; addedCount: number }> {
  const database = await openJournalDatabase();
  const transaction = database.transaction(ENTRY_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  const store = transaction.objectStore(ENTRY_STORE);
  const request = store.getAll();
  let addedCount = 0;

  request.onsuccess = () => {
    const currentEntries = normalizeJournalEntries(request.result);
    if (!currentEntries) {
      transaction.abort();
      return;
    }

    const existingIds = new Set(currentEntries.map((entry) => entry.id));
    for (const entry of importedEntries) {
      if (existingIds.has(entry.id)) continue;
      store.put(entry);
      existingIds.add(entry.id);
      addedCount += 1;
    }
  };

  await complete;
  return {
    entries: await readJournalEntries(database),
    addedCount,
  };
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
    getSnapshot,
    getServerSnapshot,
  );
  const entries = snapshot.entries;
  const storageError = snapshot.error;
  const storageReady = entries !== null;
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const error = writeError ?? storageError;

  async function saveEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const content = draft.trim();
    if (!trimmedTitle || !content || !entries) return;

    const newEntry = {
      id: window.crypto.randomUUID(),
      title: trimmedTitle,
      content,
      createdAt: new Date().toISOString(),
    };
    setSaving(true);
    try {
      await writeJournalEntry(newEntry);
      publishSnapshot({
        entries: [newEntry, ...entries],
        error: storageError,
      });
      announceJournalChange();
      setSelectedEntry(null);
      setTitle("");
      setDraft("");
      setWriteError(null);
      setNotice("Entry saved on this device.");
    } catch (saveError) {
      console.error("Failed to save journal entry in IndexedDB:", saveError);
      setWriteError("Couldn't save this entry in this browser. Your draft is still here.");
      setNotice(null);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(id: string) {
    if (!entries) return;
    if (!window.confirm("Delete this journal entry? This can't be undone.")) return;
    try {
      await removeJournalEntry(id);
      publishSnapshot({
        entries: entries.filter((entry) => entry.id !== id),
        error: storageError,
      });
      announceJournalChange();
      if (selectedEntry?.id === id) setSelectedEntry(null);
      setWriteError(null);
    } catch (deleteError) {
      console.error("Failed to delete journal entry from IndexedDB:", deleteError);
      setWriteError("Couldn't delete this entry from this browser. Please try again.");
    }
  }

  function exportBackup() {
    if (!entries) return;

    let downloadUrl: string | null = null;
    try {
      const backup = {
        format: "momentum-journal-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        entries,
      };
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `momentum-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      }, 1000);
      setWriteError(null);
      setNotice("Journal backup downloaded. Keep the file somewhere safe.");
    } catch (exportError) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      console.error("Failed to export journal backup:", exportError);
      setWriteError("Couldn't download your journal backup. Please try again.");
      setNotice(null);
    }
  }

  async function importBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > MAX_BACKUP_SIZE) {
      setWriteError("This backup is too large to import (maximum 25 MB).");
      setNotice(null);
      return;
    }

    setImporting(true);
    setWriteError(null);
    setNotice(null);
    try {
      const importedEntries = parseJournalBackup(await file.text());
      const result = await mergeJournalEntries(importedEntries);
      publishSnapshot({ entries: result.entries, error: storageError });
      announceJournalChange();
      setWriteError(null);
      setNotice(
        importedEntries.length === 0
          ? "This backup contains no entries."
          : result.addedCount === 0
          ? "All entries in this backup are already in your journal."
          : `Imported ${result.addedCount} ${result.addedCount === 1 ? "entry" : "entries"}. Existing entries were kept.`,
      );
    } catch (importError) {
      console.error("Failed to import journal backup:", importError);
      setWriteError(
        importError instanceof Error
          ? importError.message
          : "Couldn't import this backup. Please check the file and try again.",
      );
    } finally {
      setImporting(false);
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
                onClick={() => void refreshJournal()}
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
                  disabled={!storageReady || saving || importing || !title.trim() || !draft.trim()}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save entry"}
                </button>
              </div>
            </form>
          </section>

          <section
            aria-labelledby="saved-entries-heading"
            className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d1cec7] pb-3">
              <h2
                id="saved-entries-heading"
                className="font-serif text-[19px] font-medium text-[#1D2525]"
              >
                Your entries
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#8a8780]">
                  {storageReady ? entries.length : "—"}
                </span>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  aria-label="Choose a Momentum journal backup JSON file"
                  className="sr-only"
                  onChange={importBackup}
                />
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  disabled={!storageReady || importing || saving}
                  className="rounded-lg border border-[#b8b5ae] bg-[#F8F6F1] px-3 py-1.5 text-[12px] font-medium text-[#1D2525] transition-colors hover:border-[#16759b] hover:text-[#16759b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {importing ? "Importing…" : "Import backup"}
                </button>
                <button
                  type="button"
                  onClick={exportBackup}
                  disabled={!storageReady || saving || importing}
                  className="rounded-lg border border-[#b8b5ae] bg-[#F8F6F1] px-3 py-1.5 text-[12px] font-medium text-[#1D2525] transition-colors hover:border-[#16759b] hover:text-[#16759b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Export backup
                </button>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#8a8780]">
              Import or export a JSON backup. Imports add new entries without
              replacing existing ones. Backup files aren’t encrypted; store
              them somewhere private.
            </p>

            {snapshot.entries === null && !snapshot.error ? (
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
                        disabled={saving || importing}
                        aria-label={`Delete “${entry.title}”`}
                        className="rounded px-1.5 py-1 text-[12px] text-[#8a8780] transition-colors hover:bg-[#a03a5e]/10 hover:text-[#a03a5e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16759b] disabled:cursor-not-allowed disabled:opacity-40"
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
