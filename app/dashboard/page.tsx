// Spec 14.2: the dashboard.
//
// Spec 11.2 requires the page to verify the session itself, so the session is
// read here on the server. Under cacheComponents a cookies() read is a request
// read, so this segment opts out of instant navigation and blocks on the
// server, which is what an authenticated page needs.
//
// When unauthenticated the component below renders only the unlock form. No
// order is queried, so no order data can reach the HTML.

import { isAuthenticated } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import UnlockForm from "./UnlockForm";
import LogoutButton from "./LogoutButton";

export const instant = false;
export const maxDuration = 60;

export default async function DashboardPage() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Shop dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the demo passcode to view orders.
        </p>
        <UnlockForm />
      </main>
    );
  }

  // Only now, and only on the server, are orders read.
  const orders = await listOrders();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Shop dashboard</h1>
          <p className="text-sm text-slate-600">
            {orders.length} order{orders.length === 1 ? "" : "s"} · times in
            Africa/Algiers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard"
            className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </a>
          <LogoutButton />
        </div>
      </header>

      {orders.length === 0 ? (
        <p className="mt-8 rounded border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No orders yet. Place one from the chat page and refresh.
        </p>
      ) : (
        <>
          {/* Desktop: a table. Narrow screens: cards, via the md: classes. */}
          <table className="mt-6 hidden w-full border-collapse text-left text-sm md:table">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Ref</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3">Qty / options</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Delivery</th>
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{o.reference}</td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-600">
                    {o.createdAtLabel}
                  </td>
                  <td className="py-2 pr-3">{o.productName}</td>
                  <td className="py-2 pr-3">
                    {o.quantity}
                    {o.size ? ` · ${o.size}` : ""}
                    {o.color ? ` · ${o.color}` : ""}
                  </td>
                  <td className="py-2 pr-3">
                    {o.customerName}
                    <br />
                    <span className="text-slate-600">{o.customerPhone}</span>
                  </td>
                  <td className="py-2 pr-3">
                    {o.deliveryMethod === "HOME" ? "Home" : "Office"} ·{" "}
                    {o.wilaya}
                    {/* A-07: no address line for office delivery. */}
                    {o.deliveryMethod === "HOME" && o.deliveryAddress ? (
                      <>
                        <br />
                        <span className="text-slate-600">{o.deliveryAddress}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {o.total} DZD
                  </td>
                  <td className="py-2">
                    <StatusLabel status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-6 space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id} className="rounded border border-slate-200 bg-white p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-600">
                    {o.reference}
                  </span>
                  <StatusLabel status={o.status} />
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
                <p className="mt-1 text-slate-600">{o.createdAtLabel}</p>
                <p className="mt-2 font-medium">{o.total} DZD</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

/** Spec 14.2: a clear status label. Plain text, no server internals. */
function StatusLabel({ status }: { status: string }) {
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
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}