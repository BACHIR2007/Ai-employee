// A-14: OWNER order actions. Passcode protected.
//
// Same strict body, same domain functions and the same rules as the public
// visitor route, so the owner can never reach a state a visitor cannot.

import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthenticated, NO_STORE_HEADERS } from "@/lib/auth";
import { findOrderById } from "@/lib/orders";
import { cancelOrder, confirmOrder } from "@/lib/order-actions";

export const maxDuration = 60;

const actionSchema = z
  .object({
    action: z.enum(["CONFIRM", "CANCEL"]),
  })
  .strict();

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function deny() {
  return NextResponse.json({ error: "not_found" }, { status: 401, headers: NO_STORE_HEADERS });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return deny();
  if (!(await isAuthenticated())) return deny();

  const { id } = await params;

  let parsed: z.infer<typeof actionSchema>;
  try {
    parsed = actionSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const owned = await findOrderById(id);
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const result =
    parsed.action === "CONFIRM" ? await confirmOrder(id) : await cancelOrder(id);

  if (!result.ok) {
    const current = await findOrderById(id);
    if (!current) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json(
      { error: "conflict", reason: result.reason, order: current },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }

  const updated = await findOrderById(id);
  return NextResponse.json({ order: updated }, { status: 200, headers: NO_STORE_HEADERS });
}