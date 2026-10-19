"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AiSettingsDialog from "@/app/ui/ai-settings";
import {
  applyScheduleEdits,
  type ChatMessage,
  isAiConfigured,
  notifyCalendarChanged,
  type QuotaUsage,
  readAiSettings,
  readQuotaUsage,
  type ScheduleProposal,
  type ScheduleProposalEdit,
  setCalendarPreview,
  streamChat,
  subscribeAiSettings,
} from "@/app/lib/ai";

// SSR has no localStorage — render the "not connected" state, then React picks
// up the saved settings (same trick as the focus timer).
const getServerSnapshot = () => null;

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The calendar's own clock labels ("9:30 AM"), for the approval card.
function fmt(hour: number) {
  if (hour >= 24) return "12 AM";
  const mins = hour % 1 === 0.5 ? ":30" : "";
  const h = Math.floor(hour);
  if (h === 0) return `12${mins} AM`;
  if (h < 12) return `${h}${mins} AM`;
  if (h === 12) return `12${mins} PM`;
  return `${h - 12}${mins} PM`;
}

// One line per staged change: "Move Mon 4:00 – 5:30 PM · Essay" etc.
function editLabel(edit: ScheduleProposal["edits"][number]) {
  if (edit.type === "remove") return `Remove · ${edit.title}`;
  const range = `${DAY_NAMES[edit.day]} ${fmt(edit.start_hour)} – ${fmt(edit.start_hour + edit.duration)}`;
  return `${edit.type === "move" ? "Move" : "Add"} · ${edit.title} · ${range}`;
}

export default function Chat() {
  const settings = useSyncExternalStore(
    subscribeAiSettings,
    readAiSettings,
    getServerSnapshot,
  );
  const configured = isAiConfigured(settings);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Free-tier counter streamed back by the route (null when the connection
  // doesn't declare a quota).
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  // Schedule edits the model staged, awaiting the user's explicit approval —
  // same human-in-the-loop gate as the Generate Schedule review step.
  const [proposal, setProposal] = useState<
    (ScheduleProposal & { kept: number[]; state: "pending" | "applying" | "done" }) | null
  >(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the newest text in view while the reply streams in.
  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Changing the connection (provider/model/key/base URL) can change the
  // budget, so drop the counter when the settings are written. The callback
  // runs from the store's subscription — never synchronously in an effect.
  useEffect(() => subscribeAiSettings(() => setQuota(null)), []);

  // Show the budget at all times: read the live counter whenever the
  // connection changes (a streamed reply overwrites it with a fresher value,
  // and this fetch never spends anything).
  useEffect(() => {
    let cancelled = false;
    async function loadQuota() {
      if (!isAiConfigured(settings)) {
        setQuota(null);
        return;
      }
      const live = await readQuotaUsage(settings);
      if (!cancelled) setQuota(live);
    }
    loadQuota();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  // A fresh proposal replaces any still waiting on the old one.
  function stageProposal(next: ScheduleProposal) {
    setProposal({ ...next, kept: next.edits.map((edit) => edit.index), state: "pending" });
    previewProposal(next.edits, next.edits.map((edit) => edit.index));
  }

  // Ghost the kept subset on the calendar: adds and moves land where they
  // would land, removals fade their own rows. Anything unchecked disappears
  // from the grid too — the card is the source of truth.
  function previewProposal(edits: ScheduleProposalEdit[], kept: number[]) {
    const keptSet = new Set(kept);
    const drafts = edits
      .filter((edit) => keptSet.has(edit.index) && edit.type !== "remove")
      .map((edit) => {
        if (edit.type === "remove") return null;
        return {
          title: edit.title,
          day: edit.day,
          start_hour: edit.start_hour,
          duration: edit.duration,
        };
      })
      .filter((draft): draft is NonNullable<typeof draft> => draft !== null);
    const hiddenIds = edits
      .filter((edit) => keptSet.has(edit.index) && edit.type !== "add")
      .map((edit) => (edit.type === "remove" || edit.type === "move" ? edit.id : ""));
    setCalendarPreview(
      drafts.length || hiddenIds.length ? { drafts, hiddenIds } : null,
    );
  }

  function toggleKept(index: number) {
    if (!proposal) return;
    // Same rule as the modal: no side effects inside an updater — build the
    // next kept-set up front (each click re-renders before the next, so the
    // closure value is fresh) and publish the preview afterwards.
    const kept = proposal.kept.includes(index)
      ? proposal.kept.filter((i) => i !== index)
      : [...proposal.kept, index];
    setProposal({ ...proposal, kept });
    previewProposal(proposal.edits, kept);
  }

  // Approve: the browser (not the model) posts the token plus the kept edit
  // indices, then repaints the calendar beside it.
  async function approveProposal() {
    if (!proposal || proposal.state !== "pending") return;
    setProposal({ ...proposal, state: "applying" });
    try {
      const result = await applyScheduleEdits(proposal.token, proposal.kept);
      setCalendarPreview(null);
      setProposal({ ...proposal, state: "done" });
      notifyCalendarChanged();
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.message },
      ]);
    } catch (applyError) {
      setCalendarPreview(null);
      setProposal(null);
      setError((applyError as Error).message);
    }
  }

  function rejectProposal() {
    setCalendarPreview(null);
    setProposal(null);
  }

  async function send() {
    const text = message.trim();
    if (streaming) return;
    if (!configured) {
      setSettingsOpen(true);
      return;
    }
    if (!text) return;

    const history: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages([...history, { role: "assistant", content: "" }]);
    setMessage("");
    setError(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        settings,
        history,
        (delta) =>
          setMessages((current) => {
            const last = current[current.length - 1];
            if (!last || last.role !== "assistant") return current;
            return [
              ...current.slice(0, -1),
              { ...last, content: last.content + delta },
            ];
          }),
        controller.signal,
        setQuota,
        stageProposal,
      );
    } catch (streamError) {
      if ((streamError as Error).name !== "AbortError") {
        setError((streamError as Error).message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      // Drop the placeholder when the reply was stopped or came back empty.
      setMessages((current) => {
        const last = current[current.length - 1];
        return last && last.role === "assistant" && last.content === ""
          ? current.slice(0, -1)
          : current;
      });
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }
  return (
    // Full width when stacked under the calendar on phones; fixed 310px
    // sidebar on desktop. Height is bounded in both modes so the input
    // never scrolls out of reach.
    <div className="flex h-[70vh] max-h-[640px] w-full flex-col border-t border-white/10 bg-[#1D2525] lg:h-[calc(100vh-40px)] lg:max-h-none lg:w-[310px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h2 className="text-[15px] text-[#E4E0D8]">AI Chat</h2>
        {quota && (
          <span
            className={`text-[11px] tabular-nums ${
              quota.remaining === 0 ? "text-[#D26390]" : "text-[#E4E0D8]/50"
            }`}
            title="AI requests used today against your free-tier quota (resets midnight Pacific)"
          >
            {quota.used}/{quota.limit} today
          </span>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="AI settings"
          title={configured ? `Connected to ${settings.model}` : "Connect an AI"}
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-[#E4E0D8]/70 transition-colors hover:bg-white/10 hover:text-[#E4E0D8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB]"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              configured ? "bg-[#6DBACB]" : "bg-[#D26390]"
            }`}
            aria-hidden="true"
          />
          <span aria-hidden="true" className="text-[14px]">
            ⚙
          </span>
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !error && (
          <div className="mt-6 text-center text-[13px] text-[#E4E0D8]/60">
            {configured ? (
              <p>Ask anything — the reply shows up here.</p>
            ) : (
              <>
                <p className="mb-3">No AI connected yet.</p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-lg bg-[#16759b] px-3 py-2 text-[13px] text-white hover:bg-[#1b83ad] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB]"
                >
                  Add an API key
                </button>
              </>
            )}
          </div>
        )}

        {messages.map((entry, index) => (
          <p
            key={index}
            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[13px] ${
              entry.role === "user"
                ? "ml-auto bg-[#16759b] text-white"
                : "mr-auto bg-white/5 text-[#E4E0D8]"
            }`}
          >
            {entry.content || "…"}
          </p>
        ))}

        {proposal && (
          <div className="mr-auto max-w-[92%] rounded-lg bg-[#0C425A] px-3 py-2.5 text-[13px] text-[#E4E0D8]">
            <p className="mb-1 font-medium">Schedule changes — your approval needed</p>
            <p className="mb-2 text-[12px] text-[#E4E0D8]/70">
              {proposal.summary} The dashed blocks on the calendar are what
              this would do — untick anything to drop it.
            </p>
            <ul className="mb-2.5 space-y-1">
              {proposal.edits.map((edit) => {
                const checked = proposal.kept.includes(edit.index);
                return (
                  <li key={edit.index} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKept(edit.index)}
                      disabled={proposal.state !== "pending"}
                      aria-label={editLabel(edit)}
                      className="h-3.5 w-3.5 accent-[#6DBACB]"
                    />
                    <span className={checked ? "" : "text-[#E4E0D8]/40 line-through"}>
                      {editLabel(edit)}
                    </span>
                  </li>
                );
              })}
            </ul>
            {proposal.state === "done" ? (
              <p className="text-[12px] text-[#6DBACB]">Applied.</p>
            ) : (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={rejectProposal}
                  disabled={proposal.state !== "pending"}
                  className="rounded-lg px-2.5 py-1 text-[12px] text-[#E4E0D8]/70 transition hover:bg-white/10 hover:text-[#E4E0D8] disabled:opacity-40"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={approveProposal}
                  disabled={proposal.state !== "pending" || proposal.kept.length === 0}
                  className="rounded-lg bg-[#16759b] px-2.5 py-1 text-[12px] text-white transition hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {proposal.state === "applying"
                    ? "Applying…"
                    : `Approve${proposal.kept.length ? ` (${proposal.kept.length})` : ""}`}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-[#D26390]/15 px-3 py-2 text-[12px] text-[#D26390]"
          >
            {error}
          </p>
        )}
      </div>

      <div className="p-3">
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={onKeyDown}
            className="resize-none w-full px-4 pt-3.5 pb-11 h-[98px] rounded-lg bg-[#1D2525] text-white border-1 border-[#E4E0D8] placeholder:text-[#E4E0D8] placeholder:font-light"
            placeholder={
              configured ? "Ask anything..." : "Add an API key to chat..."
            }
          ></textarea>
          {streaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop response"
              className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-[13px] leading-none text-[#E4E0D8] transition-all hover:bg-white/10"
            >
              ■
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              aria-label="Send message"
              className="absolute bottom-2 right-2.5 flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-[#E4E0D8] transition-all hover:translate-x-0.5 hover:bg-white/10"
            >
              →
            </button>
          )}
        </div>
      </div>

      <AiSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
