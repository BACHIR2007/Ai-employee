// A-14: per-visitor order actions. No passcode.
//
// The order must belong to the visitor, otherwise the answer is 404, never 403:
// a 403 would confirm the order exists. An unknown id is the same 404.
//
// The body is strict: exactly {"action":"CONFIRM"} or {"action":"CANCEL"},
// nothing else. Unknown keys are rejected rather than ignored.

import { NextResponse } from "next/server";
import { z } from "zod";
import { readVisitor } from "@/lib/visitor";
import { findVisitorOrder } from "@/lib/orders";
import { cancelOrder, confirmOrder } from "@/lib/order-actions";
import { visitorOrderHeaders } from "../route";

export const maxDuration = 60;

/** Strict: strips nothing, so an unexpected field fails validation. */
const actionSchema = z
  .object({
    action: z.enum(["CONFIRM", "CANCEL"]),
  })
  .strict();

/** Spec 11.2: same-origin check for a state-changing request. */
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

function badRequest() {
  return NextResponse.json(
    { error: "invalid_request" },
    { status: 400, headers: visitorOrderHeaders },
  );
}

function notFound() {
  // Deliberately identical for "unknown id" and "not your order".
  return NextResponse.json(
    { error: "not_found" },
    { status: 404, headers: visitorOrderHeaders },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) return badRequest();

  const { keyHash } = await readVisitor();
  // Without a visitor there is nothing this caller can own.
  if (!keyHash) return notFound();

  const { id } = await params;

  let parsed: z.infer<typeof actionSchema>;
  try {
    parsed = actionSchema.parse(await request.json());
  } catch {
    return badRequest();
  }

  // Ownership check BEFORE acting, so a foreign id is never touched.
  const owned = await findVisitorOrder(id, keyHash);
  if (!owned) return notFound();

  const result =
    parsed.action === "CONFIRM" ? await confirmOrder(id) : await cancelOrder(id);

  if (!result.ok) {
    const current = await findVisitorOrder(id, keyHash);
    if (!current) return notFound();
    return NextResponse.json(
      { error: "conflict", reason: result.reason, order: current },
      { status: 409, headers: visitorOrderHeaders },
    );
  }

  const updated = await findVisitorOrder(id, keyHash);
  if (!updated) return notFound();
  return NextResponse.json({ order: updated }, { status: 200, headers: visitorOrderHeaders });
}