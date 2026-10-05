// Shared helpers for the focus timer (used by the header timer and stats page).
// The running session is kept in localStorage so it survives page navigation
// and reloads while the header component remounts.

export const FOCUS_START_KEY = "momentum.focus.start";

export function readFocusStart(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(FOCUS_START_KEY);
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : value;
  } catch {
    return null;
  }
}

export function writeFocusStart(iso: string) {
  window.localStorage.setItem(FOCUS_START_KEY, iso);
  emit();
}

export function clearFocusStart() {
  window.localStorage.removeItem(FOCUS_START_KEY);
  emit();
}

// ---- Store subscription for useSyncExternalStore ----
// React reads the running session straight from localStorage; same-tab writes
// notify listeners here (the native `storage` event only fires cross-tab).
type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeFocusStart(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === FOCUS_START_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// Whole seconds elapsed between two ISO timestamps (never negative).
export function elapsedSeconds(startISO: string, endMs: number = Date.now()): number {
  const start = Date.parse(startISO);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((endMs - start) / 1000));
}
