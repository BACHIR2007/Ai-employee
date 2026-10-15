// Day 6 confirmation gate.
//
// A pure function: it decides whether a CREATE_ORDER proposal is acceptable.
// It performs NO side effects. Creating the order, consuming the gate and
// decrementing stock belong to Day 7.
//
// Conditions come from spec 7.3 and addendum A-09.

import {
  buildConfirmationHash,
  buildTrustedPricing,
  normalizeDraftForOrder,
  type CatalogProduct,
} from "./order-summary";
import type { Draft } from "./draft";

export type GateResult =
  | { ok: true; hash: string; reason: null }
  | { ok: false; reason: GateReason };

export type GateReason =
  | "not-awaiting-confirmation"
  | "no-stored-hash"
  | "incomplete-draft"
  | "missing-trusted-pricing"
  | "hash-mismatch";

export type GateInput = {
  /** Current phase from the database. */
  phase: string;
  /** The hash stored when the summary was issued. */
  storedHash: string | null;
  /** The draft currently stored on the conversation. */
  draft: Draft;
  /** Fresh catalog, including current prices and stock. */
  catalog: CatalogProduct[];
};

/**
 * Spec 7.3 conditions 1 to 3, plus A-09's "recompute with current database
 * price and configured fee". A price or fee change makes the recomputed hash
 * differ from the stored one, which is exactly the intended behaviour.
 */
export function evaluateConfirmationGate(input: GateInput): GateResult {
  // 1. The phase must be AWAITING_CONFIRMATION.
  if (input.phase !== "AWAITING_CONFIRMATION") {
    return { ok: false, reason: "not-awaiting-confirmation" };
  }

  // 2. A stored hash must exist (spec 7.3 condition 2).
  if (!input.storedHash) {
    return { ok: false, reason: "no-stored-hash" };
  }

  // 3. The draft must still be complete and valid.
  const normalized = normalizeDraftForOrder(input.draft, input.catalog);
  if (!normalized.ok) {
    return { ok: false, reason: "incomplete-draft" };
  }

  // 4. Trusted pricing must still be available.
  const pricing = buildTrustedPricing(normalized.draft, input.catalog);
  if (!pricing) {
    return { ok: false, reason: "missing-trusted-pricing" };
  }

  // 5. The recomputed hash must match the stored hash.
  const recomputed = buildConfirmationHash(normalized.draft, pricing);
  if (recomputed !== input.storedHash) {
    return { ok: false, reason: "hash-mismatch" };
  }

  return { ok: true, hash: recomputed, reason: null };
}
