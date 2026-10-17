// Spec 12.6 / 11.2: protected.
//
// Spec 11.2 is explicit that hiding a link is not protection, so this handler
// verifies the session itself. An unauthenticated caller gets a 401 with an
// empty body, never order data and never a hint about why.

import { NextResponse } from "next/server";
import { isAuthenticated, NO_STORE_HEADERS } from "@/lib/auth";
import { listOrders } from "@/lib/orders";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ orders: [] }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const orders = await listOrders();
  return NextResponse.json({ orders }, { status: 200, headers: NO_STORE_HEADERS });
}