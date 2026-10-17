"use client";

// Logout posts to /api/admin/logout, which clears the HttpOnly cookie. The
// client cannot clear it itself, so it asks the server and then refreshes.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}