// A-14: the OWNER dashboard, at /admin.
//
// This is the passcode dashboard from Day 9, unchanged in behaviour: all
// orders, Confirm/Cancel per status, Refresh and Log out. It is deliberately NOT
// linked from anywhere in the UI and carries noindex metadata, because judges
// use the public /dashboard instead (A-14).

import type { Metadata } from "next";
import { isAuthenticated } from "@/lib/auth";
import { listAllOrders } from "@/lib/orders";
import UnlockForm from "./UnlockForm";
import LogoutButton from "./LogoutButton";
import OwnerActions from "./OwnerActions";
import ResetDemoData from "./ResetDemoData";

export const metadata: Metadata = {
  title: "Owner",
  robots: { index: false, follow: false },
};

// Under cacheComponents a cookies() read is a request read, so this segment
// blocks on the server instead of being prerendered.
export const instant = false;
export const maxDuration = 60;

export default async function AdminPage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Owner access</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the owner passcode to view every order.
        </p>
        <UnlockForm />
      </main>
    );
  }

  const orders = await listAllOrders();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Owner · all orders</h1>
          <p className="text-sm text-slate-600">
            {orders.length} order{orders.length === 1 ? "" : "s"} · times in
            Africa/Algiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </a>
          <LogoutButton />
        </div>
      </header>

      {orders.length === 0 ? (
        <p className="mt-8 rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No orders yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li
              key={o.id}
              className="rounded border border-slate-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-600">{o.reference}</span>
                <span className="text-xs text-slate-600">{o.createdAtLabel}</span>
              </div>
              <p className="mt-2 font-medium">{o.productName}</p>
              <p className="text-slate-600">
                {o.quantity}
                {o.size ? ` · ${o.size}` : ""}
                {o.color ? ` · ${o.color}` : ""}
              </p>
              <p className="mt-1">
                {o.customerName} · {o.customerPhone}
              </p>
              <p className="text-slate-600">
                {o.deliveryMethod === "HOME" ? "Home" : "Office"} · {o.wilaya}
                {o.deliveryMethod === "HOME" && o.deliveryAddress
                  ? ` · ${o.deliveryAddress}`
                  : ""}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-medium">{o.total} DZD</span>
                <OwnerActions
                  orderId={o.id}
                  status={o.status}
                  reference={o.reference}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* A-15: the reset is owner-only and lives here and nowhere else. There
          is no link or hint to it on the public page. */}
      <ResetDemoData />
    </main>
  );
}