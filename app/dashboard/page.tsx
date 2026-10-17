// A-14: the public per-visitor page. No passcode.
//
// It is a thin shell around the reusable MyOrders component, which talks to the
// public routes. Nothing here is protected and nothing here is a secret.

import type { Metadata } from "next";
import MyOrders from "./MyOrders";

export const metadata: Metadata = { title: "My orders" };

// Reads no cookies or headers, so it can prerender.
export const instant = true;

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <MyOrders />
    </main>
  );
}