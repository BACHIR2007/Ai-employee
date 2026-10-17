"use client";

// The customer panel. It is styled as a generic direct-message thread so the
// idea reads at a glance, but it deliberately borrows nothing from any real
// messaging brand: no logo, no gradient, no brand colour scheme.
//
// Every existing chat behaviour is unchanged: the conversationId lives only in
// React state, the 500-character cap is enforced on input, sending is disabled
// while a request is pending, failures are friendly and retryable, dir="auto"
// makes Arabic and Latin bubbles align correctly, the message text is rendered
// as plain text and never as HTML, and the transcript is the only scrolling
// element, auto-scrolled through scrollTop.

import { useCallback, useEffect, useRef, useState } from "react";
import { SendIcon, SpinnerIcon } from "./icons";

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

/** Real questions that go through exactly the same send path as typing. */
const QUICK_START: Array<{ label: string; text: string }> = [
  { label: "السويت", text: "بكم سعر السويت؟" },
  { label: "Français", text: "Je veux commander des baskets" },
  { label: "English", text: "I'd like a grey hoodie in size L" },
];

export default function Chat({
  onOrderCreated,
}: {
  /** Called with the new order id whenever /api/chat reports one was created. */
  onOrderCreated?: (orderId: string | null) => void;
}) {
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
          orderCreated?: boolean;
          __orderId?: string | null;
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

        // The orders panel listens for this so the new order appears at once.
        if (data.orderCreated) {
          onOrderCreated?.(data.__orderId ?? null);
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
    [conversationId, pending, focusInput, onOrderCreated],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Generic direct-message header. No third-party branding anywhere. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine font-display text-sm font-semibold text-white"
        >
          BE
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-charcoal">
            @boutique.elegance
          </span>
          <span className="text-xs text-ash">Usually replies within a minute</span>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-hairline bg-linen px-2.5 py-1 text-[11px] font-medium tracking-wide text-brass uppercase">
          Simulated
        </span>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-sm text-ash">
              Write in Arabic, Darija, French or English. Ask about a price, a
              size, a colour, then place an order.
            </p>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            dir="auto"
            className={
              message.role === "customer"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-wine px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white"
                : "mr-auto max-w-[85%] rounded-2xl rounded-bl-md border border-hairline bg-linen px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-charcoal"
            }
          >
            {message.text}
          </div>
        ))}

        {pending && (
          <div
            dir="auto"
            className="mr-auto flex w-fit items-center gap-2 rounded-2xl rounded-bl-md border border-hairline bg-linen px-4 py-3"
            aria-label="Assistant is typing"
          >
            <SpinnerIcon className="h-3.5 w-3.5 text-brass" />
            <span className="text-sm text-ash">Writing…</span>
          </div>
        )}
      </div>

      {notice && (
        <div
          role="alert"
          className="shrink-0 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
        >
          <p>{notice}</p>
          {failedText && (
            <button
              type="button"
              onClick={() => void send(failedText)}
              className="mt-2 min-h-11 rounded-full bg-wine px-4 text-xs font-semibold text-white transition hover:bg-wine-deep"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="shrink-0 space-y-2 border-t border-hairline px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_START.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={pending}
              onClick={() => void send(chip.text)}
              title={chip.text}
              className="min-h-11 rounded-full border border-hairline bg-white px-3.5 text-sm font-medium text-charcoal transition hover:border-brass hover:bg-linen disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-ash">
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
            onChange={(event) => setInput(event.target.value.slice(0, MAX_INPUT))}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_INPUT}
            readOnly={pending}
            placeholder="Write a message…"
            aria-label="Message"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-hairline bg-white px-4 py-3 text-[15px] leading-snug text-charcoal outline-none placeholder:text-ash focus:border-wine focus:ring-2 focus:ring-wine/20"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-wine text-white transition hover:bg-wine-deep disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </form>

        <button
          type="button"
          onClick={startNewConversation}
          disabled={pending}
          className="min-h-11 w-full rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-medium text-charcoal transition hover:bg-linen disabled:opacity-50"
        >
          New conversation
        </button>
      </div>
    </div>
  );
}
