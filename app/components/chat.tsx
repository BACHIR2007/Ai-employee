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

/** The textarea starts at 2 rows and grows to about 6 before it scrolls. */
const COMPOSER_MIN_ROWS = 2;
const COMPOSER_MAX_ROWS = 6;
/** On a phone the composer must leave the transcript room, so it caps lower. */
const COMPOSER_MAX_ROWS_MOBILE = 4;
const ROW_HEIGHT_PX = 24;
const COMPOSER_MIN_PX = COMPOSER_MIN_ROWS * ROW_HEIGHT_PX;

const FRIENDLY_ERROR =
  "Sorry, we could not reach the assistant. Please try again.";

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

  // Auto-grow the composer from 2 rows up to about 6, then let it scroll
  // inside itself. Height is set from scrollHeight so the box never jumps.
  //
  // The cap is lower on a phone, where the composer has to share the panel
  // with the transcript. The breakpoint is read at resize time rather than kept
  // in state, so there is no hydration mismatch and no re-render.
  const resizeComposer = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const maxPx = (isDesktop ? COMPOSER_MAX_ROWS : COMPOSER_MAX_ROWS_MOBILE) * ROW_HEIGHT_PX;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, COMPOSER_MIN_PX), maxPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxPx ? "auto" : "hidden";
  }, []);

  // Scroll the message container itself, never the window and never
  // scrollIntoView, so only the transcript moves.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    resizeComposer();
  }, [input, resizeComposer]);

  // A rotation or a window resize can change which cap applies.
  useEffect(() => {
    window.addEventListener("resize", resizeComposer);
    return () => window.removeEventListener("resize", resizeComposer);
  }, [resizeComposer]);

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
    // Enter sends. Shift+Enter inserts a real newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Generic direct-message header. No third-party branding anywhere.
          On a phone it is ONE compact row: a small avatar, the handle
          truncated but never wrapped word by word, a small chip and an icon
          button with a 44px touch target. Every lg: value is the original. */}
      <header className="flex shrink-0 items-center gap-1.5 border-b border-hairline px-2 py-1.5 lg:gap-3 lg:px-4 lg:py-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wine font-display text-[11px] font-semibold text-white lg:h-11 lg:w-11 lg:text-sm"
        >
          BE
        </span>
        <div className="flex min-w-0 flex-1 flex-col lg:flex-initial">
          {/* min-w in ch is font-relative, so the handle keeps at least 12
              characters visible at any text zoom, and truncates rather than
              wrapping one word per line. */}
          <span className="min-w-[12ch] truncate text-sm font-semibold text-charcoal lg:min-w-0">
            @boutique.elegance
          </span>
          <span className="hidden text-xs text-ash lg:block">
            Usually replies within a minute
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-hairline bg-linen px-1 py-0.5 text-[9px] font-medium tracking-wide text-brass uppercase lg:ml-auto lg:px-2.5 lg:py-1 lg:text-[11px]">
          Simulated
        </span>
        <button
          type="button"
          onClick={startNewConversation}
          disabled={pending}
          aria-label="New conversation"
          title="New conversation"
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-hairline bg-white text-charcoal transition hover:bg-linen disabled:opacity-50 lg:h-auto lg:w-auto lg:px-3 lg:py-1.5 lg:text-xs lg:font-medium"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 lg:hidden"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden lg:inline">New conversation</span>
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 lg:min-h-80 lg:px-4 lg:py-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8">
            <p className="text-center text-sm text-ash">
              Write in Arabic, Darija, French or English. Ask about a price, a
              size, a colour, then place an order.
            </p>
          </div>
        ) : null}

        <div className="space-y-2.5">
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

      <div className="shrink-0 space-y-1.5 border-t border-hairline px-3 py-2 lg:px-4 lg:py-2.5">
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
            rows={COMPOSER_MIN_ROWS}
            maxLength={MAX_INPUT}
            readOnly={pending}
            dir="auto"
            placeholder="Write a message…"
            aria-label="Message"
            className="w-full flex-1 resize-none overflow-y-hidden rounded-2xl border border-hairline bg-white px-3 py-2 text-[15px] leading-6 text-charcoal outline-none placeholder:text-ash focus:border-wine focus:ring-2 focus:ring-wine/20 lg:px-4 lg:py-2.5"
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

        <p className="text-right text-xs text-ash tabular-nums">
          {input.length}/{MAX_INPUT}
        </p>
      </div>
    </div>
  );
}
