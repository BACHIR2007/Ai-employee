"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Role = "customer" | "ai";

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
};

/** Client-side timeout, a little longer than the 60s server maxDuration. */
const CLIENT_TIMEOUT_MS = 65_000;
const MAX_INPUT = 500;

const FRIENDLY_ERROR =
  "Sorry, we could not reach the assistant. Please try again.";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Scroll the message container itself, never the window, so the input bar
  // stays pinned and the page height never grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setInput("");
    setNotice(null);
    setFailedText(null);
    setConversationId(null);
    focusInput();
  }, [focusInput]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;

      const customerMessage: ChatMessage = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "customer",
        text,
      };

      setMessages((prev) => [...prev, customerMessage]);
      setInput("");
      setPending(true);
      setNotice(null);
      setFailedText(null);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, message: text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("bad status");
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("not json");
        }

        const data = (await response.json()) as {
          conversationId?: string;
          reply?: string;
          limited?: boolean;
          limitReason?: string | null;
        };

        if (typeof data.conversationId === "string") {
          setConversationId(data.conversationId);
        }

        const reply = typeof data.reply === "string" ? data.reply : FRIENDLY_ERROR;

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "ai",
            text: reply,
          },
        ]);

        if (data.limited && data.limitReason === "conversation") {
          setNotice(
            "This conversation has reached its message limit. Start a new conversation to keep asking questions.",
          );
        }
      } catch {
        // Never surface a raw error, and never imply the message succeeded.
        setFailedText(text);
        setInput(text);
        setNotice(
          controller.signal.aborted
            ? "The assistant took too long to answer. Please try again."
            : FRIENDLY_ERROR,
        );
      } finally {
        clearTimeout(timer);
        setPending(false);
        // Keep the caret in the box so the next message can be typed straight
        // away. readOnly (not disabled) is used while pending so focus is never
        // lost in the first place.
        focusInput();
      }
    },
    [conversationId, pending, focusInput],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Boutique elegance
          </h1>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Demo AI Employee
          </span>
        </div>
        <button
          type="button"
          onClick={startNewConversation}
          disabled={pending}
          className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          New conversation
        </button>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
              Ask about a product, for example its price, sizes, colors or
              stock.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            dir="auto"
            className={
              message.role === "customer"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-500 to-blue-500 px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap text-white shadow-sm"
                : "mr-auto max-w-[85%] rounded-2xl rounded-bl-md bg-zinc-100 px-3.5 py-2 text-[15px] leading-relaxed whitespace-pre-wrap text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }
          >
            {message.text}
          </div>
        ))}

        {pending && (
          <div
            dir="auto"
            className="mr-auto flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-zinc-100 px-4 py-3.5 dark:bg-zinc-800"
            aria-label="Assistant is typing"
          >
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
              style={{ animationDelay: "160ms" }}
            />
            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
              style={{ animationDelay: "320ms" }}
            />
          </div>
        )}
      </div>

      {notice && (
        <div className="shrink-0 rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>{notice}</p>
          {failedText && (
            <button
              type="button"
              onClick={() => void send(failedText)}
              className="mt-2 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="shrink-0 space-y-1.5">
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
          Demo only. Don&apos;t enter real personal data.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) =>
              setInput(event.target.value.slice(0, MAX_INPUT))
            }
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_INPUT}
            readOnly={pending}
            placeholder="Ask about a product..."
            aria-label="Message"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-full border border-zinc-300 bg-white px-4 py-3 text-[15px] leading-snug outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-violet-900"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-sm transition hover:opacity-90 disabled:opacity-40"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 rotate-90"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}