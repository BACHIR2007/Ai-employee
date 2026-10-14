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

  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setInput("");
    setNotice(null);
    setFailedText(null);
    setConversationId(null);
    inputRef.current?.focus();
  }, []);

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
          setNotice("This conversation has reached its message limit. Start a new conversation to keep asking questions.");
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
      }
    },
    [conversationId, pending],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Chat
        </h2>
        <button
          type="button"
          onClick={startNewConversation}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          disabled={pending}
        >
          New conversation
        </button>
      </div>

      <div
        className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Ask about a product, for example its price, sizes, colors or
            stock.
          </p>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            dir="auto"
            className={
              message.role === "customer"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-3 py-2 text-sm whitespace-pre-wrap text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm whitespace-pre-wrap text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            }
          >
            {message.text}
          </div>
        ))}

        {pending && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Thinking...
          </p>
        )}
        <div ref={endRef} />
      </div>

      {notice && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p>{notice}</p>
          {failedText && (
            <button
              type="button"
              onClick={() => void send(failedText)}
              className="mt-2 rounded-full border border-amber-500 px-3 py-1 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
          rows={2}
          maxLength={MAX_INPUT}
          disabled={pending}
          placeholder="Ask about a product..."
          aria-label="Message"
          className="flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Sending..." : "Send"}
        </button>
      </form>

      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {input.length}/{MAX_INPUT}
      </p>
    </div>
  );
}