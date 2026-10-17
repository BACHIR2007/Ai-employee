// A-14: the public per-visitor order list. No passcode.
//
// Returns only the orders whose conversation carries this visitor's cookie
// hash. A missing cookie or no match is simply an empty list, never an error,
// so a first-time visitor sees a sensible empty state.

import { NextResponse } from "next/server";
import { readVisitor } from "@/lib/visitor";
import { listVisitorOrders } from "@/lib/orders";

export const maxDuration = 60;

/** Private and per-cookie: never cached by a proxy or a shared cache. */
export const visitorOrderHeaders = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Vary: "Cookie",
  Pragma: "no-cache",
};

export async function GET() {
  const { keyHash } = await readVisitor();
  const orders = keyHash ? await listVisitorOrders(keyHash) : [];
  return NextResponse.json({ orders }, { status: 200, headers: visitorOrderHeaders });
}