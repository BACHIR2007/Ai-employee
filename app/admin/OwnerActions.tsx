"use client";

// Spec 10.2 / 10.3 actions for the owner view. The same domain functions run
// behind /api/admin/orders/[id]; this only chooses the request and the label.

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OwnerActions({
  orderId,
  status,
  reference,
}: {
  orderId: string;
  status: string;
  reference: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"CONFIRM" | "CANCEL" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "CONFIRM" | "CANCEL") {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(
          res.status === 409
            ? "Already in that state."
            : `Could not ${action.toLowerCase()} the order.`,
        );
        void body;
        return;
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setPending(null);
    }
  }

  // Spec 14.2: never offer an action that would not be valid.
  const canConfirm = status === "NOT_YET_CONFIRMED";
  const canCancel = status === "NOT_YET_CONFIRMED" || status === "CONFIRMED";

  return (
    <div className="flex items-center gap-2">
      {canConfirm ? (
        <button
          type="button"
          onClick={() => run("CONFIRM")}
          disabled={pending !== null}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
        >
          {pending === "CONFIRM" ? "…" : "Confirm"}
        </button>
      ) : null}
      {canCancel ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Cancel order ${reference}?`)) run("CANCEL");
          }}
          disabled={pending !== null}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
        >
          {pending === "CANCEL" ? "…" : "Cancel"}
        </button>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </div>
  );
}