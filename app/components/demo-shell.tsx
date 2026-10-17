"use client";

// Owns the two panels and the small amount of state they share: which panel is
// showing on a small screen, and the moment an order was created so the orders
// panel can reload and highlight it immediately.

import { useCallback, useState } from "react";
import Chat from "./chat";
import MyOrders from "../dashboard/MyOrders";

type Tab = "chat" | "orders";

export default function DemoShell() {
  const [tab, setTab] = useState<Tab>("chat");
  const [refreshToken, setRefreshToken] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [banner, setBanner] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const onOrderCreated = useCallback((orderId: string | null) => {
    // Bumping the token tells MyOrders to reload; the id drives the highlight.
    setRefreshToken((n) => n + 1);
    setHighlightId(orderId);
    setCount((n) => (n === null ? null : n + 1));
    setBanner(true);
  }, []);

  const showOrders = useCallback(() => {
    setTab("orders");
    setBanner(false);
  }, []);

  return (
    <>
      {/* Order-created banner. On a wide screen both panels are already visible,
          so the jump button is only offered where the tabs are. */}
      {banner ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 border border-wine/25 bg-wine/5 px-4 py-2.5"
        >
          <p className="text-sm font-medium text-charcoal">
            Order created - see it in Orders
          </p>
          <button
            type="button"
            onClick={showOrders}
            className="min-h-11 shrink-0 rounded-full bg-wine px-4 text-xs font-semibold text-white transition hover:bg-wine-deep lg:hidden"
          >
            Show it
          </button>
        </div>
      ) : null}

      {/* Small screens: a real tablist that swaps the two panels. */}
      <div
        role="tablist"
        aria-label="Demo panels"
        className="sticky top-0 z-10 flex shrink-0 gap-1 border-b border-hairline bg-ivory/95 px-3 py-2 backdrop-blur lg:hidden"
      >
        <TabButton
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          label="Chat"
          badge={null}
        />
        <TabButton
          active={tab === "orders"}
          onClick={() => setTab("orders")}
          label="Orders"
          badge={count}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-5">
        {/* Customer view */}
        <section
          role="tabpanel"
          aria-label="Customer view"
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-paper ${
            tab === "chat" ? "flex" : "hidden lg:flex"
          }`}
        >
          <PanelHeading
            title="Customer view - Instagram DM (simulated)"
            subtitle="She writes in her own language. The assistant answers in hers."
          />
          <Chat onOrderCreated={onOrderCreated} />
        </section>

        {/* Shop owner view */}
        <section
          role="tabpanel"
          aria-label="Shop owner view"
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-white shadow-paper ${
            tab === "orders" ? "flex" : "hidden lg:flex"
          }`}
        >
          <PanelHeading
            title="Shop owner view - Orders dashboard"
            subtitle="The owner confirms the order by phone"
          />
          <MyOrders
            className="flex min-h-0 flex-1 flex-col"
            refreshToken={refreshToken}
            highlightId={highlightId}
            onCountChange={setCount}
          />
        </section>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge: number | null;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition ${
        active
          ? "bg-wine text-white"
          : "border border-hairline bg-white text-charcoal hover:bg-linen"
      }`}
    >
      {label}
      {badge !== null && badge > 0 ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
            active ? "bg-white/20 text-white" : "bg-wine text-white"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PanelHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="shrink-0 border-b border-hairline bg-linen px-4 py-3">
      <h2 className="font-display text-base font-semibold text-charcoal">
        {title}
      </h2>
      <p className="mt-0.5 text-xs text-ash">{subtitle}</p>
    </div>
  );
}
