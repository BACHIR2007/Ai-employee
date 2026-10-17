"use client";

// The owner-only demo reset (spec 10.4, 14.2, addendum A-15).
//
// There is deliberately no reset control anywhere on the public page: this
// component lives only inside /admin, which needs a valid passcode session.
// The destructive step is behind typing RESET, so it cannot happen by a stray
// click, and the warning spells out exactly what is destroyed.

import { useRouter } from "next/navigation";
import { useState } from "react";

const CONFIRM_WORD = "RESET";

export default function ResetDemoData() {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const armed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function run() {
    if (!armed || pending) return;
    setPending(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        setError("The reset did not complete. Please try again.");
        return;
      }
      setTyped("");
      setDone(true);
      // Re-read the (now empty) order list so the page matches the database.
      router.refresh();
    } catch {
      setError("Network error. The demo data was not reset.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-red-300 bg-red-50 p-4">
      <h2 className="font-display text-lg font-semibold text-red-900">
        Reset demo data
      </h2>
      <p className="mt-1 text-sm text-red-800">
        This deletes <strong>ALL</strong> demo conversations, messages and orders
        for <strong>every visitor</strong>, and restores each product&apos;s
        starting stock. The shop itself and its catalog are never removed.
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-medium text-red-900">
          Type {CONFIRM_WORD} to enable the button
          <input
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={pending}
            autoComplete="off"
            spellCheck={false}
            aria-label={`Type ${CONFIRM_WORD} to confirm the reset`}
            className="mt-1 min-h-11 w-40 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold tracking-widest text-red-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-300"
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={!armed || pending}
          className="min-h-11 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
        >
          {pending ? "Resetting…" : "Reset demo data"}
        </button>
      </div>

      {done ? (
        <p role="status" className="mt-3 text-sm font-medium text-red-900">
          Demo data reset. Every conversation, message and order is gone and the
          stock is back to its starting value.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
