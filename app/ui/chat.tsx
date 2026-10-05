"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import AiSettingsDialog from "@/app/ui/ai-settings";
import {
  type ChatMessage,
  isAiConfigured,
  readAiSettings,
  streamChat,
  subscribeAiSettings,
} from "@/app/lib/ai";

// SSR has no localStorage — render the "not connected" state, then React picks
// up the saved settings (same trick as the focus timer).
const getServerSnapshot = () => null;

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the newest text in view while the reply streams in.
  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages]);

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
    <div className="flex h-[calc(100vh-40px)] w-[310px] flex-col bg-[#1D2525]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <h2 className="text-[15px] text-[#E4E0D8]">AI Chat</h2>
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
