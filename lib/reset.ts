// Day 11 demo reset (spec 10.4, 12.8).
//
// One transaction, and only ever rows the demo owns:
//   1. delete Message
//   2. delete Order
//   3. delete Conversation
//   4. set every seeded Product's stock back to its seed value
//
// The Business row and the Product rows themselves are NEVER deleted. The
// catalog is the demo's setup, not its data.
//
// Idempotent: running it twice is safe and does the same thing. If a concurrent
// write lands while it runs, the transaction rolls back completely, so the demo
// is never left half-reset.

import { prisma } from "./prisma";
import { DEMO_PRODUCTS } from "./seed-data";

export type ResetOptions = {
  /**
   * TEST-ONLY failure injection, thrown after the deletes and before the stock
   * restore so the transaction has provably done work that must be rolled back.
   * It is an explicit parameter: no route passes it and nothing reads it from
   * the environment, so it cannot be reached through the API.
   */
  __testFailAfterDeletes?: boolean;
};

export type ResetResult = {
  ok: true;
  deletedMessages: number;
  deletedOrders: number;
  deletedConversations: number;
  productsRestocked: number;
};

/** Internal marker so a deliberate rollback is not reported as a real fault. */
export class ResetRollback extends Error {
  constructor() {
    super("test-failure-after-deletes");
    this.name = "ResetRollback";
  }
}

/**
 * Restores the seeded demo state.
 *
 * Foreign keys are respected by deleting in dependency order: a Message belongs
 * to a Conversation, and an Order belongs to a Conversation too.
 */
export async function resetDemoData(options: ResetOptions = {}): Promise<ResetResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Messages first: they point at a Conversation.
    const messages = await tx.message.deleteMany({});

    // 2. Orders next: they also point at a Conversation.
    const orders = await tx.order.deleteMany({});

    // 3. Only now can the Conversations go.
    const conversations = await tx.conversation.deleteMany({});

    // The injection point sits between the deletes and the restock, so a
    // rollback has to undo real work rather than run before anything happened.
    if (options.__testFailAfterDeletes) {
      throw new ResetRollback();
    }

    // 4. Restore the seeded stock, keyed by name from the one shared module.
    let productsRestocked = 0;
    for (const product of DEMO_PRODUCTS) {
      const row = await tx.product.findFirst({
        where: { name: product.name },
        select: { id: true, stockQuantity: true },
      });
      // A missing product means the catalog was never seeded. Skip it rather
      // than inventing a row: the reset never creates catalog entries.
      if (!row) continue;
      if (row.stockQuantity === product.stockQuantity) continue;
      await tx.product.update({
        where: { id: row.id },
        data: { stockQuantity: product.stockQuantity },
      });
      productsRestocked += 1;
    }

    return {
      ok: true,
      deletedMessages: messages.count,
      deletedOrders: orders.count,
      deletedConversations: conversations.count,
      productsRestocked,
    };
  });
}
