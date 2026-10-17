"use client";

// A-14: the visitor's own orders.
//
// Built as a reusable component with no page chrome of its own, so the same
// list can be embedded anywhere. It talks only to the public routes:
// GET /api/orders and PATCH /api/orders/[id]. Every value it renders comes from
// the API response; nothing here invents data and nothing is hard-coded per
// order.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BagIcon,
  CheckIcon,
  CrossIcon,
  HomeIcon,
  OfficeIcon,
  PhoneIcon,
  PinIcon,
  RefreshIcon,
  SpinnerIcon,
} from "../components/icons";

export type PublicOrder = {
  id: string;
  reference: string;
  createdAt: string;
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

/** "#" plus the first 6 characters of the id, upper-cased. */
function referenceOf(o: PublicOrder): string {
  return `#${o.id.slice(0, 6).toUpperCase()}`;
}

/** 0550123456 -> 0550 12 34 56. Anything unexpected is left as it came. */
function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10 && d.startsWith("0")) {
    return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
  }
  return raw;
}

/** Integer minor units, so the breakdown never drifts on a float. */
function toMinor(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function fromMinor(v: number): string {
  return (v / 100).toFixed(2);
}

function statusLine(status: PublicOrder["status"]): string {
  if (status === "CONFIRMED") return "Confirmed by the shop";
  if (status === "CANCELLED") return "Cancelled - stock restored";
  return "Waiting for the shop to call and confirm";
}

function statusTone(status: PublicOrder["status"]): string {
  if (status === "CONFIRMED") return "bg-emerald-100 text-emerald-900";
  if (status === "CANCELLED") return "bg-stone-200 text-stone-700";
  return "bg-amber-100 text-amber-900";
}

export default function MyOrders({
  showRefresh = true,
  autoRefresh = true,
  className = "",
  /** Bump this to force an immediate reload, e.g. after a new order arrives. */
  refreshToken = 0,
  /** The order to highlight briefly, usually the one just created. */
  highlightId = null,
  /** Reports the number of orders, so the tab badge can show it. */
  onCountChange,
}: {
  showRefresh?: boolean;
  autoRefresh?: boolean;
  className?: string;
  refreshToken?: number;
  highlightId?: string | null;
  onCountChange?: (count: number) => void;
}) {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visible = useRef(true);
  const mutating = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      const list: PublicOrder[] = Array.isArray(body.orders) ? body.orders : [];
      setOrders(list);
      setState("ready");
      setError(null);
      onCountChange?.(list.length);
    } catch {
      setState("error");
      setError("Could not load your orders.");
    }
  }, [onCountChange]);

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

  // The chat panel bumps refreshToken the moment an order is created.
  useEffect(() => {
    if (refreshToken === 0) return;
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [refreshToken, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      // Only while the tab is on screen and nothing is being changed, so a
      // reload can never race an action the visitor just triggered.
      if (visible.current && !mutating.current) load();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  async function act(orderId: string, action: "CONFIRM" | "CANCEL") {
    mutating.current = true;
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
      mutating.current = false;
      setPendingId(null);
    }
  }

  return (
    <section className={className} aria-label="My orders">
      {showRefresh ? (
        <div className="flex shrink-0 items-center justify-end border-b border-hairline px-4 py-1.5">
          <button
            type="button"
            onClick={load}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-charcoal transition hover:bg-linen"
          >
            <RefreshIcon className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      ) : null}

      {error && state !== "error" ? (
        <p role="alert" className="px-4 pt-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {state === "loading" ? (
        <p className="px-4 py-6 text-sm text-ash">Loading your orders…</p>
      ) : null}

      {state === "error" ? (
        <div role="alert" className="px-4 py-6 text-sm text-red-800">
          <p>{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-2 min-h-11 rounded-full border border-hairline px-4 text-xs font-medium"
          >
            Try again
          </button>
        </div>
      ) : null}

      {state === "ready" && orders.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <BagIcon className="mx-auto h-7 w-7 text-brass" />
          <p className="mt-3 text-sm font-medium text-charcoal">
            Orders you place in the chat appear here
          </p>
          <p className="mt-1 text-xs text-ash">
            The owner confirms the order by phone.
          </p>
        </div>
      ) : null}

      {orders.length > 0 ? (
        <ul className="space-y-3 px-4 py-4">
          {orders.map((o) => {
            const busy = pendingId === o.id;
            const canConfirm = o.status === "NOT_YET_CONFIRMED";
            const canCancel =
              o.status === "NOT_YET_CONFIRMED" || o.status === "CONFIRMED";
            const highlighted = highlightId !== null && highlightId === o.id;
            return (
              <li
                key={o.id}
                className={`rounded-2xl border bg-white p-4 shadow-paper transition-colors ${
                  highlighted ? "border-wine ring-2 ring-wine/25" : "border-hairline"
                }`}
              >
                {/* Reference and creation time */}
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-xs font-semibold tracking-wide text-brass">
                    {referenceOf(o)}
                  </span>
                  <span className="text-xs text-ash">
                    {o.createdAtLabel} · Algiers
                  </span>
                </div>

                {/* Status chip and one plain-English line */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(o.status)}`}
                  >
                    {o.status === "CONFIRMED"
                      ? "Confirmed"
                      : o.status === "CANCELLED"
                        ? "Cancelled"
                        : "Not yet confirmed"}
                  </span>
                  <span className="text-xs text-ash">{statusLine(o.status)}</span>
                </div>

                {/* Customer */}
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Customer">
                    <span className="font-medium">{o.customerName}</span>
                  </Row>
                  <Row label="Phone" icon={<PhoneIcon />}>
                    <a
                      href={`tel:${o.customerPhone.replace(/\D/g, "")}`}
                      className="underline decoration-hairline underline-offset-2 hover:decoration-wine"
                    >
                      {formatPhone(o.customerPhone)}
                    </a>
                  </Row>
                </dl>

                {/* Delivery */}
                <dl className="mt-2 space-y-1.5 text-sm">
                  <Row
                    label="Delivery"
                    icon={o.deliveryMethod === "HOME" ? <HomeIcon /> : <OfficeIcon />}
                  >
                    {o.deliveryMethod === "HOME" ? "Home delivery" : "Delivery office"}
                  </Row>
                  <Row label="Wilaya" icon={<PinIcon />}>
                    {o.wilaya}
                  </Row>
                  {/* The address only exists for a home delivery. */}
                  {o.deliveryMethod === "HOME" && o.deliveryAddress ? (
                    <Row label="Address" icon={<PinIcon />}>
                      {o.deliveryAddress}
                    </Row>
                  ) : null}
                </dl>

                {/* Item */}
                <div className="mt-3 rounded-xl bg-linen px-3 py-2.5">
                  <p className="text-sm font-medium">{o.productName}</p>
                  <p className="text-xs text-ash">
                    {[
                      o.color,
                      o.size,
                      `Quantity ${o.quantity}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {/* Price breakdown */}
                <dl className="mt-3 space-y-1 text-sm">
                  <PriceRow
                    label={`${o.unitPrice} DZD × ${o.quantity}`}
                    value={`${fromMinor(toMinor(o.unitPrice) * o.quantity)} DZD`}
                  />
                  <PriceRow
                    label="Delivery fee"
                    value={`${o.deliveryPrice} DZD`}
                  />
                  <div className="flex items-baseline justify-between gap-3 border-t border-hairline pt-2">
                    <dt className="text-sm font-semibold">Total</dt>
                    <dd className="font-display text-lg font-semibold text-wine tabular-nums">
                      {o.total} DZD
                    </dd>
                  </div>
                </dl>

                {/* Actions, only where they are valid */}
                {canConfirm || canCancel ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canConfirm ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(o.id, "CONFIRM")}
                        className="flex min-h-11 items-center gap-1.5 rounded-full bg-wine px-4 text-sm font-semibold text-white transition hover:bg-wine-deep disabled:opacity-50"
                      >
                        {busy ? (
                          <SpinnerIcon className="h-3.5 w-3.5" />
                        ) : (
                          <CheckIcon className="h-3.5 w-3.5" />
                        )}
                        Confirm
                      </button>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Cancel order ${referenceOf(o)}? Stock will be restored.`,
                            )
                          ) {
                            act(o.id, "CANCEL");
                          }
                        }}
                        className="flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-white px-4 text-sm font-semibold text-charcoal transition hover:bg-linen disabled:opacity-50"
                      >
                        {busy ? (
                          <SpinnerIcon className="h-3.5 w-3.5" />
                        ) : (
                          <CrossIcon className="h-3.5 w-3.5" />
                        )}
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

function Row({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-ash">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function PriceRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 flex-1 truncate text-xs text-ash">{label}</dt>
      <dd className="shrink-0 text-xs text-charcoal tabular-nums">{value}</dd>
    </div>
  );
}
