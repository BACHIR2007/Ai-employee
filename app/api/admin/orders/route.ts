// A-14: the OWNER order list. Passcode protected, like the rest of /admin.
//
// This is the passcode-protected list that used to live at /api/orders. It
// shows every order, including the ones whose conversation predates the visitor
// cookie and therefore belongs to no visitor.

import { NextResponse } from "next/server";
import { isAuthenticated, NO_STORE_HEADERS } from "@/lib/auth";
import { listAllOrders } from "@/lib/orders";

export const maxDuration = 60;

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ orders: [] }, { status: 401, headers: NO_STORE_HEADERS });
  }
  const orders = await listAllOrders();
  return NextResponse.json({ orders }, { status: 200, headers: NO_STORE_HEADERS });
}