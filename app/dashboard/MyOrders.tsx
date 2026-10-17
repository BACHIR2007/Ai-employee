"use client";

// A-14: the visitor's own orders.
//
// Built as a reusable component with no page chrome of its own, so the redesign
// can embed the same list inside the main chat page later. It talks only to the
// public routes: GET /api/orders and PATCH /api/orders/[id].

import { useCallback, useEffect, useRef, useState } from "react";

export type PublicOrder = {
  id: string;
  reference: string;
  createdAtLabel: string;
  productName: string;
  quantity: number;
  size: string | null;
  color: string | null;
  customerName: string;
  customerPhone: string;
  deliveryMethod: "HOME" | "OFFICE";
  wilaya: string;
  deliveryAddress: string | null;
  unitPrice: string;
  deliveryPrice: string;
  total: string;
  status: "NOT_YET_CONFIRMED" | "CONFIRMED" | "CANCELLED";
};

type State = "loading" | "ready" | "error";

const AUTO_REFRESH_MS = 15_000;

export default function MyOrders({
  /** Set false when the host page already has a refresh control. */
  showRefresh = true,
  autoRefresh = true,
  className = "",
}: {
  showRefresh?: boolean;
  autoRefresh?: boolean;
  className?: string;
}) {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visible = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setOrders(Array.isArray(body.orders) ? body.orders : []);
      setState("ready");
      setError(null);
    } catch {
      setState("error");
      setError("Could not load your orders.");
    }
  }, []);

  useEffect(() => {
    visible.current = !document.hidden;
    const onVisible = () => {
      visible.current = !document.hidden;
      if (visible.current) load();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Deferred by a tick so the first fetch never runs during commit, which
    // keeps this a plain data fetch rather than a render-phase state change.
    const initial = setTimeout(() => load(), 0);
    return () => {
      clearTimeout(initial);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      if (visible.current) load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  async function act(orderId: string, action: "CONFIRM" | "CANCEL") {
    setPendingId(orderId);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.status === 409) {
        setError("That order is already in that state.");
      } else if (!res.ok) {
        setError("That action could not be completed.");
      }
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={className} aria-label="My orders">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">My orders</h2>
        {showRefresh ? (
          <button
            type="button"
            onClick={load}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        ) : null}
      </div>

      {state === "loading" ? (
        <p className="mt-3 text-sm text-slate-600">Loading your orders…</p>
      ) : null}

      {state === "error" ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
          <button type="button" onClick={load} className="ml-2 underline">
            Try again
          </button>
        </p>
      ) : null}

      {error && state !== "error" ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {state === "ready" && orders.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          You have no orders yet. Place one in the chat.
        </p>
      ) : null}

      {orders.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {orders.map((o) => {
            const busy = pendingId === o.id;
            const canConfirm = o.status === "NOT_YET_CONFIRMED";
            const canCancel =
              o.status === "NOT_YET_CONFIRMED" || o.status === "CONFIRMED";
            return (
              <li
                key={o.id}
                className="rounded border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-600">
                    {o.reference}
                  </span>
                  <StatusChip status={o.status} />
                </div>
                <p className="mt-1 font-medium">{o.productName}</p>
                <p className="text-slate-600">
                  {o.quantity}
                  {o.size ? ` · ${o.size}` : ""}
                  {o.color ? ` · ${o.color}` : ""} · {o.total} DZD
                </p>
                <p className="text-slate-500">{o.createdAtLabel}</p>
                <div className="mt-2 flex gap-2">
                  {canConfirm ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(o.id, "CONFIRM")}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Confirm"}
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Cancel order ${o.reference}? Stock will be restored.`,
                          )
                        ) {
                          act(o.id, "CANCEL");
                        }
                      }}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function StatusChip({ status }: { status: PublicOrder["status"] }) {
  const label =
    status === "CONFIRMED"
      ? "Confirmed"
      : status === "CANCELLED"
        ? "Cancelled"
        : "Not yet confirmed";
  const tone =
    status === "CONFIRMED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "CANCELLED"
        ? "bg-slate-200 text-slate-700"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
  );
}