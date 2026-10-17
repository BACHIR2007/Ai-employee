// Day 10 order actions. Spec 10.2, 10.3.
//
// Two rules drive everything here:
//
//   Spec 10.2 CONFIRM: a conditional update from NOT_YET_CONFIRMED to
//   CONFIRMED. Confirmation does NOT decrement stock again. A repeated click
//   changes nothing and returns the current state.
//
//   Spec 10.3 CANCEL: the status transition is the guard. Stock is restored
//   ONLY inside the same transaction as a successful transition, so a double
//   click can never restore stock twice. CANCELLED never returns to active.
//
// Both are plain functions with no HTTP knowledge, so the public visitor routes
// and the owner admin routes share exactly the same logic.

import { prisma } from "./prisma";

export type OrderActionResult =
  | { ok: true; id: string; status: "CONFIRMED" | "CANCELLED"; changed: true }
  | { ok: false; id: string; status: string; changed: false; reason: ConflictReason };

export type ConflictReason =
  | "already-cancelled"
  | "already-confirmed"
  | "not-found";

export type OrderActionOptions = {
  /**
   * TEST-ONLY failure injection, thrown after the status update has been
   * applied inside the transaction. Never passed by a route handler and never
   * read from the environment, so it cannot be reached from the API.
   */
  __testFailAfterStatusUpdate?: boolean;
};

/**
 * Spec 10.2.
 *
 * A single conditional update, so confirmation is atomic on its own and there
 * is no partial state to roll back. No injection hook is offered here: the only
 * multi-step operation is cancelOrder, which is the one that needs it.
 */
export async function confirmOrder(orderId: string): Promise<OrderActionResult> {
  const updated = await prisma.order.updateMany({
    where: { id: orderId, status: "NOT_YET_CONFIRMED" },
    data: { status: "CONFIRMED" },
  });

  if (updated.count === 0) {
    // Nothing changed. Report the CURRENT state so the caller can answer 409.
    const current = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!current) {
      return { ok: false, id: orderId, status: "missing", changed: false, reason: "not-found" };
    }
    return {
      ok: false,
      id: current.id,
      status: current.status,
      changed: false,
      // CANCELLED can never be confirmed; CONFIRMED is already confirmed.
      reason: current.status === "CANCELLED" ? "already-cancelled" : "already-confirmed",
    };
  }

  return { ok: true, id: orderId, status: "CONFIRMED", changed: true };
}

/** Spec 10.3. One transaction: status transition first, stock restore second. */
export async function cancelOrder(
  orderId: string,
  options: OrderActionOptions = {},
): Promise<OrderActionResult> {
  let result: OrderActionResult | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. The guard. count === 1 is the only way stock may be restored.
      const cancelled = await tx.order.updateMany({
        where: { id: orderId, status: { in: ["NOT_YET_CONFIRMED", "CONFIRMED"] } },
        data: { status: "CANCELLED" },
      });

      if (cancelled.count === 0) {
        const current = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true, status: true },
        });
        if (!current) {
          result = { ok: false, id: orderId, status: "missing", changed: false, reason: "not-found" };
          return;
        }
        result = {
          ok: false,
          id: current.id,
          status: current.status,
          changed: false,
          reason: current.status === "CANCELLED" ? "already-cancelled" : "already-confirmed",
        };
        return;
      }

      // 2. Read the order's product and quantity INSIDE the transaction.
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { productId: true, quantity: true },
      });

      if (options.__testFailAfterStatusUpdate) {
        // Thrown after the status update, so the whole transaction rolls back:
        // neither the status change nor the stock restore survives.
        throw new OrderActionRollback();
      }

      // 3. Restore exactly this order's quantity, once.
      await tx.product.update({
        where: { id: order.productId },
        data: { stockQuantity: { increment: order.quantity } },
      });

      result = { ok: true, id: orderId, status: "CANCELLED", changed: true };
    });
  } catch (e) {
    if (e instanceof OrderActionRollback) {
      const current = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });
      return {
        ok: false,
        id: orderId,
        status: current?.status ?? "missing",
        changed: false,
        reason: current?.status === "CANCELLED" ? "already-cancelled" : "already-confirmed",
      };
    }
    throw e;
  }

  if (!result) {
    throw new Error("cancelOrder: transaction produced no result");
  }
  return result;
}

/** Internal marker so a deliberate rollback is not confused with a real error. */
class OrderActionRollback extends Error {
  constructor() {
    super("test-failure-after-status-update");
    this.name = "OrderActionRollback";
  }
}

/** Exported for tests that need to assert the stock side of a rollback. */
export { OrderActionRollback as __OrderActionRollback };

/** Reads an order's status for a caller that only needs the current state. */
export async function currentStatus(orderId: string): Promise<string | null> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  return row?.status ?? null;
}