// Day 7 order creation.
//
// Spec 10.1 and addendum A-09. This module is the ONLY place that creates an
// Order or changes stock, and it does both inside a single transaction.
//
// Sequence, exactly as A-09 requires:
//
//   1. Read the draft and recompute the hash from the current draft and the
//      CURRENT database price and configured fee, BEFORE the transaction.
//   2. If that hash differs from the stored one, create nothing. Regenerate the
//      summary, store the new hash, and send it.
//   3. Otherwise, in ONE transaction:
//        a. consume the gate with a single conditional update that requires
//           exactly one row to change,
//        b. revalidate the draft against the freshly read Product row,
//        c. decrement stock conditionally, requiring exactly one row,
//        d. insert the Order with status NOT_YET_CONFIRMED and price snapshots.
//   4. ANY failure rolls back everything, including the gate update, so the
//      draft, phase and hash survive and stock and Orders are untouched.
//
// No Gemini call happens in this file, and none is possible from here.

import { Prisma } from "../generated/prisma/client";
import { prisma } from "./prisma";
import type { Draft } from "./draft";
import {
  buildConfirmationHash,
  buildSummary,
  buildTrustedPricing,
  normalizeDraftForOrder,
  type CatalogProduct,
  type CanonicalDraft,
  type TrustedPricing,
} from "./order-summary";
import { evaluateConfirmationGate, type GateReason } from "./confirmation-gate";
import type { Language } from "./templates";

/** A product row read from the database, trimmed to what order creation needs. */
type ProductRow = {
  id: string;
  name: string;
  price: Prisma.Decimal;
  stockQuantity: number;
  options: Prisma.JsonValue;
};

/**
 * Typed failure so the caller can pick the right localized template and know
 * whether the draft survived. Anything thrown that is not one of these is
 * treated as an unexpected error and rolled back like the rest.
 */
export class OrderCreationError extends Error {
  constructor(
    readonly kind:
      | "gate-rejected"
      | "price-changed"
      | "out-of-stock"
      | "invalid-draft"
      | "unknown-error",
    readonly detail: string,
    /** Current stock, for the out-of-stock message. */
    readonly stockQuantity?: number,
    /** Present when the failure needs a fresh summary + hash shown instead. */
    readonly summary?: string,
    readonly hash?: string,
  ) {
    super(detail);
    this.name = "OrderCreationError";
  }
}

export type CreateOrderInput = {
  conversationId: string;
  language: Language;
  /**
   * TEST-ONLY failure injection. Never passed by the API route and never read
   * from the environment, so it cannot be reached by a customer. It throws
   * after the gate update has been applied inside the transaction, proving the
   * gate update is rolled back with everything else.
   */
  __testFailAfterGate?: boolean;
};

export type CreateOrderResult = {
  orderId: string;
  /** The exact figures written to the Order row. */
  pricing: TrustedPricing;
  draft: CanonicalDraft;
};

/** Reads the catalog fresh. Prices and stock come from the database, not Gemini. */
export async function loadTrustedCatalog(
  businessId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CatalogProduct[]> {
  const products = await client.product.findMany({
    where: { businessId },
    select: { id: true, name: true, price: true, stockQuantity: true, options: true },
    orderBy: { name: "asc" },
  });
  return products.map((p) => {
    const options = (p.options ?? {}) as { sizes?: string[]; colors?: string[] };
    return {
      id: p.id,
      name: p.name,
      priceDzd: p.price.toString(),
      stockQuantity: p.stockQuantity,
      sizes: options.sizes ?? [],
      colors: options.colors ?? [],
    };
  });
}

/**
 * Creates exactly one Order for a confirmed draft.
 *
 * Throws an OrderCreationError on every failure path, after the database has
 * been left in its pre-call state. Returns the created order's id and the
 * figures that were snapshotted onto it.
 */
export async function createOrderFromConfirmedDraft(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const { conversationId, language } = input;

  // ---------- BEFORE the transaction: read the draft and recompute the hash ----
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      businessId: true,
      phase: true,
      orderDraft: true,
      confirmationHash: true,
    },
  });
  if (!conversation) throw new OrderCreationError("unknown-error", "conversation-not-found");

  const catalog = await loadTrustedCatalog(conversation.businessId);
  const draft = (conversation.orderDraft ?? {}) as Draft;
  const storedHash = conversation.confirmationHash;

  // Step 1: the gate. A-09 also wants the hash recomputed against current data,
  // which is exactly what the gate does.
  const gate = evaluateConfirmationGate({
    phase: conversation.phase,
    storedHash,
    draft,
    catalog,
  });
  if (!gate.ok) {
    throw await gateFailure(gate.reason, draft, catalog, language, conversation);
  }

  // Step 2: capture the normalized draft and the figures that were confirmed.
  // A-09: the draft is read and hashed BEFORE the transaction opens.
  const normalized = normalizeDraftForOrder(draft, catalog);
  if (!normalized.ok) {
    throw new OrderCreationError("invalid-draft", normalized.reason);
  }
  const pricing = buildTrustedPricing(normalized.draft, catalog);
  if (!pricing) throw new OrderCreationError("invalid-draft", "no-trusted-fee");
  if (normalized.draft.quantity > pricing.stockQuantity) {
    throw new OrderCreationError(
      "out-of-stock",
      "quantity-above-stock",
      pricing.stockQuantity,
    );
  }

  // ---------- ONE transaction ----------
  let createdOrderId = "";
  await prisma.$transaction(async (tx) => {
    // (a) Consume the gate. A-09: a single conditional update whose count MUST
    // be exactly 1. This is the duplicate-submission guard.
    const claimed = await tx.conversation.updateMany({
      where: {
        id: conversationId,
        phase: "AWAITING_CONFIRMATION",
        confirmationHash: storedHash,
      },
      data: { phase: "IDLE", orderDraft: Prisma.DbNull, confirmationHash: null },
    });
    if (claimed.count !== 1) {
      // Someone else consumed it, or the state moved. Roll back everything.
      throw new OrderCreationError("gate-rejected", "gate-count-not-1");
    }

    if (input.__testFailAfterGate) {
      throw new OrderCreationError("unknown-error", "test-failure-after-gate");
    }

    // (b) Revalidate against the database, inside the transaction.
    const product = (await tx.product.findUnique({
      where: { id: normalized.draft.productId },
      select: { id: true, name: true, price: true, stockQuantity: true, options: true },
    })) as ProductRow | null;
    if (!product) throw new OrderCreationError("invalid-draft", "product-not-found");

    // The options the customer confirmed must still exist.
    const options = (product.options ?? {}) as { sizes?: string[]; colors?: string[] };
    if (normalized.draft.size && !(options.sizes ?? []).includes(normalized.draft.size)) {
      throw new OrderCreationError("invalid-draft", "size-no-longer-available");
    }
    if (normalized.draft.color && !(options.colors ?? []).includes(normalized.draft.color)) {
      throw new OrderCreationError("invalid-draft", "color-no-longer-available");
    }

    // The price must still be the one the customer confirmed. If it moved in
    // the gap between the gate and here, do not silently charge a different
    // amount: roll back and let the caller show a fresh summary.
    if (product.price.toString() !== pricing.unitPrice) {
      throw new OrderCreationError("price-changed", "unit-price-changed");
    }
    if (product.stockQuantity < normalized.draft.quantity) {
      throw new OrderCreationError(
        "out-of-stock",
        "insufficient-at-creation",
        product.stockQuantity,
      );
    }

    // (c) Conditional stock decrement. Spec 10.1 step 3: the WHERE clause is
    // the guard, so two concurrent callers cannot both decrement.
    const decremented = await tx.product.updateMany({
      where: {
        id: normalized.draft.productId,
        stockQuantity: { gte: normalized.draft.quantity },
      },
      data: { stockQuantity: { decrement: normalized.draft.quantity } },
    });
    if (decremented.count !== 1) {
      throw new OrderCreationError("out-of-stock", "conditional-decrement-matched-no-row");
    }

    // (d) Create the Order with database-derived snapshots.
    const order = await tx.order.create({
      data: {
        businessId: conversation.businessId,
        conversationId,
        productId: normalized.draft.productId,
        quantity: normalized.draft.quantity,
        size: normalized.draft.size,
        color: normalized.draft.color,
        customerName: normalized.draft.customerName,
        customerPhone: normalized.draft.customerPhone,
        unitPrice: new Prisma.Decimal(pricing.unitPrice),
        deliveryMethod: normalized.draft.deliveryMethod,
        // A-01: the canonical nameFr, not the Arabic display name.
        wilaya: normalized.draft.wilaya,
        // A-07: null for OFFICE.
        deliveryAddress: normalized.draft.deliveryAddress,
        deliveryPrice: new Prisma.Decimal(pricing.deliveryPrice),
        status: "NOT_YET_CONFIRMED",
      },
      select: { id: true },
    });
    createdOrderId = order.id;
  });

  return { orderId: createdOrderId, pricing, draft: normalized.draft };
}

/**
 * Turns a failed gate into the right failure.
 *
 * A hash mismatch is A-09's price/fee-changed case: create nothing, rebuild
 * the summary from current data, store the new hash and send it. Any other gate
 * reason means the confirmation itself was not valid.
 */
async function gateFailure(
  reason: GateReason,
  draft: Draft,
  catalog: CatalogProduct[],
  language: Language,
  conversation: { id: string; businessId: string },
): Promise<OrderCreationError> {
  if (reason === "hash-mismatch") {
    const rebuilt = prepareFreshSummary(draft, catalog, language);
    if (rebuilt) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { confirmationHash: rebuilt.hash },
      });
      return new OrderCreationError(
        "price-changed",
        "confirmation-hash-changed",
        undefined,
        rebuilt.summary,
        rebuilt.hash,
      );
    }
  }
  return new OrderCreationError("gate-rejected", reason);
}

/**
 * Rebuilds the summary for a still-valid draft whose hash no longer matches.
 * Returns null when the draft is not in a summarizable state at all, in which
 * case the caller must not present a summary.
 */
function prepareFreshSummary(
  draft: Draft,
  catalog: CatalogProduct[],
  language: Language,
): { summary: string; hash: string } | null {
  const normalized = normalizeDraftForOrder(draft, catalog);
  if (!normalized.ok) return null;
  const pricing = buildTrustedPricing(normalized.draft, catalog);
  if (!pricing) return null;
  if (normalized.draft.quantity > pricing.stockQuantity) return null;
  return {
    summary: buildSummary(normalized.draft, pricing, language),
    hash: buildConfirmationHash(normalized.draft, pricing),
  };
}