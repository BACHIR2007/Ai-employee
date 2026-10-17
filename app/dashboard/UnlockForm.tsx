"use client";

// The unlock form. It holds no passcode and no secret: the value is typed by
// the user, posted to /api/admin/login, and never stored in this bundle.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UnlockForm() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(false);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        // The cookie is HttpOnly, so the only way to pick up the new session
        // is to let the server render again.
        setPasscode("");
        router.refresh();
        return;
      }
      setError(true);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label htmlFor="passcode" className="block text-sm font-medium text-slate-700">
        Passcode
      </label>
      <input
        id="passcode"
        name="passcode"
        type="password"
        autoComplete="current-password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        required
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pending || passcode.length === 0}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Checking…" : "Unlock"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          Wrong passcode.
        </p>
      ) : null}
    </form>
  );
}