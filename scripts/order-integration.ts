// Day 7 integration tests for createOrderFromConfirmedDraft.
//
// These call the domain function DIRECTLY. No Gemini call, no HTTP, no model.
// Every case asserts the Order count, the stock, and the conversation's
// phase / hash / draft afterwards, so a rollback that only half worked cannot
// pass.
//
// Fake test data only: "Test Client" and 0550123456.
//
// IMPORTANT: these tests CREATE real rows in the demo database. They only ever
// add rows; nothing is deleted. Run scripts/restore-seed-stock.ts afterwards to
// put stock back to the seed values.
//
// Usage: npm run test:orders

import { prisma } from "../lib/prisma";
import {
  createOrderFromConfirmedDraft,
  loadTrustedCatalog,
  OrderCreationError,
} from "../lib/order-create";
import {
  buildConfirmationHash,
  buildTrustedPricing,
  normalizeDraftForOrder,
} from "../lib/order-summary";
import type { Draft } from "../lib/draft";

const FAKE_NAME = "Test Client"; // fake test data
const FAKE_PHONE = "0550123456"; // fake test data

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(
    name,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// A product with the smallest stock, so a decrement is easy to observe.
const LOW_STOCK = "jeans homme"; // seeded 3
const OTHER = "T-shirt coton bio"; // seeded 20

let businessId = "";
let lowId = "";
let lowPrice = "";
let otherId = "";
let otherPrice = "";

const baseDraft = (over: Partial<Draft> = {}): Draft => ({
  productId: lowId,
  quantity: 1,
  size: "M",
  color: "Blanc",
  customerName: FAKE_NAME,
  customerPhone: FAKE_PHONE,
  deliveryMethod: "OFFICE",
  wilaya: "Tissemsilt",
  ...over,
});

const SEED_STOCK: Record<string, number> = { [LOW_STOCK]: 3, [OTHER]: 20 };

/**
 * Puts the two fixture products back to their seeded stock and price.
 *
 * Cases must be independent: a case that legitimately consumes stock would
 * otherwise starve the next one and turn it into a stock test by accident.
 * Out-of-stock behaviour is covered deliberately in case 4, which drops the
 * stock on purpose. UPDATE only; nothing is deleted.
 */
async function resetFixtures() {
  await prisma.product.update({
    where: { id: lowId },
    data: { stockQuantity: SEED_STOCK[LOW_STOCK], price: lowPrice },
  });
  await prisma.product.update({
    where: { id: otherId },
    data: { stockQuantity: SEED_STOCK[OTHER], price: otherPrice },
  });
}

type Snapshot = {
  orders: number;
  stock: number;
  otherStock: number;
};

async function snap(): Promise<Snapshot> {
  const [orders, low, other] = await Promise.all([
    prisma.order.count(),
    prisma.product.findUniqueOrThrow({ where: { id: lowId } }),
    prisma.product.findUniqueOrThrow({ where: { id: otherId } }),
  ]);
  return { orders, stock: low.stockQuantity, otherStock: other.stockQuantity };
}

/** Puts the conversation into AWAITING_CONFIRMATION with a valid hash. */
async function seedConversation(draft: Draft, tamper?: (h: string) => string) {
  const conversation = await prisma.conversation.create({
    data: {
      businessId,
      phase: "ORDER_COLLECTION",
      orderDraft: draft as unknown as object,
    },
  });
  const catalog = await loadTrustedCatalog(businessId);
  const normalized = normalizeDraftForOrder(draft, catalog);
  if (!normalized.ok) throw new Error(`fixture not normalizable: ${normalized.reason}`);
  const pricing = buildTrustedPricing(normalized.draft, catalog);
  if (!pricing) throw new Error("fixture has no pricing");
  const hash = tamper ? tamper(buildConfirmationHash(normalized.draft, pricing)) : buildConfirmationHash(normalized.draft, pricing);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { phase: "AWAITING_CONFIRMATION", confirmationHash: hash },
  });
  return { id: conversation.id, hash };
}

async function state(id: string) {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id },
    select: { phase: true, orderDraft: true, confirmationHash: true },
  });
  return {
    phase: c.phase,
    hash: c.confirmationHash,
    draft: (c.orderDraft ?? {}) as Draft,
    hasDraft: Boolean(c.orderDraft),
  };
}

/**
 * Runs the creation and expects it to fail. Returns null when it unexpectedly
 * succeeded, so the caller's own assertions fail loudly.
 */
async function expectFailure(id: string): Promise<OrderCreationError | null> {
  try {
    await createOrderFromConfirmedDraft({ conversationId: id, language: "fr" });
    return null;
  } catch (e) {
    return e instanceof OrderCreationError ? e : null;
  }
}

async function main() {
  const business = await prisma.business.findFirst();
  if (!business) throw new Error("no Business row");
  businessId = business.id;

  const low = await prisma.product.findFirstOrThrow({ where: { name: LOW_STOCK } });
  const other = await prisma.product.findFirstOrThrow({ where: { name: OTHER } });
  lowId = low.id;
  lowPrice = low.price.toString();
  otherId = other.id;
  otherPrice = other.price.toString();

  console.log(`\nfixture: ${LOW_STOCK} (stock ${low.stockQuantity}) and ${OTHER} (stock ${other.stockQuantity})`);

  // ---------------------------------------------------------------- 1. SUCCESS
  await resetFixtures();
  console.log("\n--- 1. success: one order, stock down by the quantity ---");
  {
    const before = await snap();
    const draft = baseDraft({ quantity: 2 });
    const conv = await seedConversation(draft);

    const created = await createOrderFromConfirmedDraft({
      conversationId: conv.id,
      language: "fr",
    });
    const after = await snap();
    const st = await state(conv.id);

    eq("exactly one new Order", after.orders - before.orders, 1);
    eq("stock decreased by the quantity", before.stock - after.stock, 2);
    eq("the other product is untouched", after.otherStock, before.otherStock);
    check("stock never goes negative", after.stock >= 0, `stock=${after.stock}`);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.orderId } });
    eq("status is NOT_YET_CONFIRMED", order.status, "NOT_YET_CONFIRMED");
    eq("quantity snapshotted", order.quantity, 2);
    eq("productId correct", order.productId, lowId);
    eq("customer name normalized", order.customerName, FAKE_NAME);
    eq("phone normalized", order.customerPhone, FAKE_PHONE);
    eq("size canonical", order.size, "M");
    eq("color canonical", order.color, "Blanc");
    eq("wilaya is canonical nameFr", order.wilaya, "Tissemsilt");
    eq("unitPrice is the database price", order.unitPrice.toString(), lowPrice);
    eq("deliveryMethod OFFICE", order.deliveryMethod, "OFFICE");
    // A-07: OFFICE must not carry an address.
    eq("deliveryAddress null for OFFICE", order.deliveryAddress, null);
    eq("deliveryPrice is the configured fee", order.deliveryPrice.toString(), "600");
    eq("conversationId linked", order.conversationId, conv.id);
    eq("businessId linked", order.businessId, businessId);

    // The gate was consumed.
    eq("phase returned to IDLE", st.phase, "IDLE");
    eq("confirmation hash cleared", st.hash, null);
    check("orderDraft cleared", !st.hasDraft, JSON.stringify(st.draft));
  }

  // ------------------------------------------------- 2. CALLED TWICE (serial)
  await resetFixtures();
  console.log("\n--- 2. calling it twice on the same conversation ---");
  {
    const before = await snap();
    const conv = await seedConversation(baseDraft({ quantity: 1 }));

    const first = await createOrderFromConfirmedDraft({
      conversationId: conv.id,
      language: "fr",
    });
    const second = await expectFailure(conv.id);
    const after = await snap();
    const st = await state(conv.id);

    check("the first call succeeded", Boolean(first.orderId));
    eq("exactly one Order was created", after.orders - before.orders, 1);
    eq("stock decremented exactly once", before.stock - after.stock, 1);
    check(
      "the second call was rejected",
      second !== null && second.kind === "gate-rejected",
      second ? `kind=${second.kind} detail=${second.detail}` : "no error thrown",
    );
    eq("phase is IDLE after the second call", st.phase, "IDLE");
    eq("hash still cleared", st.hash, null);
  }

  // ------------------------------------------- 3. TWO CONCURRENT CALLS
  await resetFixtures();
  console.log("\n--- 3. two concurrent calls for the same conversation ---");
  {
    const before = await snap();
    const conv = await seedConversation(baseDraft({ quantity: 1 }));

    const results = await Promise.allSettled([
      createOrderFromConfirmedDraft({ conversationId: conv.id, language: "fr" }),
      createOrderFromConfirmedDraft({ conversationId: conv.id, language: "fr" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    const after = await snap();
    const st = await state(conv.id);

    eq("exactly one Order created despite the race", after.orders - before.orders, 1);
    eq("stock decremented exactly once despite the race", before.stock - after.stock, 1);
    eq("exactly one call succeeded", fulfilled.length, 1);
    eq("exactly one call was rejected", rejected.length, 1);
    const rejectedErr = rejected[0]?.reason as OrderCreationError | undefined;
    check(
      "the losing call failed as gate-rejected or out-of-stock",
      rejectedErr instanceof OrderCreationError &&
        (rejectedErr.kind === "gate-rejected" || rejectedErr.kind === "out-of-stock"),
      rejectedErr ? `kind=${rejectedErr.kind}` : "unknown",
    );
    eq("phase is IDLE after the race", st.phase, "IDLE");
    eq("hash still cleared after the race", st.hash, null);
    check("stock still not negative", after.stock >= 0, `stock=${after.stock}`);
  }

  // ------------------------------------------- 4. STOCK INSUFFICIENT AT CREATION
  await resetFixtures();
  console.log("\n--- 4. stock insufficient at creation time (race with another buyer) ---");
  {
    // Draft a quantity that passes the pre-transaction check, then drop the
    // stock below it before the transaction runs, the way a concurrent order
    // would. The conditional decrement must refuse and roll everything back.
    const conv = await seedConversation(baseDraft({ quantity: 2 }));
    const before = await snap();

    await prisma.product.update({
      where: { id: lowId },
      data: { stockQuantity: 1 },
    });
    const mid = await snap();

    const err = await expectFailure(conv.id);
    const after = await snap();
    const st = await state(conv.id);

    eq("no Order created", after.orders, mid.orders);
    eq("stock unchanged by the failed attempt", after.stock, mid.stock);
    check(
      "reported as out-of-stock",
      err !== null && err.kind === "out-of-stock",
      err ? `kind=${err.kind} detail=${err.detail}` : "no error",
    );
    check(
      "the error carries the real stock for the message",
      err?.stockQuantity === 1,
      `stockQuantity=${err?.stockQuantity}`,
    );
    // The whole transaction rolled back, so the confirmation is still usable.
    eq("phase preserved after rollback", st.phase, "AWAITING_CONFIRMATION");
    eq("hash preserved after rollback", st.hash, conv.hash);
    check("draft preserved after rollback", st.hasDraft, JSON.stringify(st.draft));

    // Put the stock back for the remaining cases.
    await prisma.product.update({
      where: { id: lowId },
      data: { stockQuantity: before.stock },
    });
  }

  // ------------------------------------------- 5. PRICE CHANGED SINCE THE SUMMARY
  await resetFixtures();
  console.log("\n--- 5. price changed since the summary ---");
  {
    const before = await snap();
    const conv = await seedConversation(baseDraft({ quantity: 1 }));

    await prisma.product.update({
      where: { id: lowId },
      data: { price: "9999.00" },
    });

    const err = await expectFailure(conv.id);
    const after = await snap();
    const st = await state(conv.id);

    eq("no Order created", after.orders, before.orders);
    eq("stock unchanged", after.stock, before.stock);
    check(
      "reported as price-changed",
      err !== null && err.kind === "price-changed",
      err ? `kind=${err.kind}` : "no error",
    );
    check(
      "a fresh summary is supplied",
      Boolean(err?.summary) && Boolean(err?.hash),
      `summary=${Boolean(err?.summary)} hash=${Boolean(err?.hash)}`,
    );
    eq("the new hash was stored", st.hash, err?.hash);
    eq("phase stays AWAITING_CONFIRMATION so the customer can re-confirm", st.phase, "AWAITING_CONFIRMATION");
    check("draft preserved", st.hasDraft);

    await prisma.product.update({ where: { id: lowId }, data: { price: lowPrice } });
  }

  // ------------------------------------------- 6. HASH MISMATCH
  await resetFixtures();
  console.log("\n--- 6. stored hash does not match the draft ---");
  {
    const before = await snap();
    // Tamper with the stored hash so it can never match a recomputation.
    const conv = await seedConversation(baseDraft({ quantity: 1 }), () => "0".repeat(64));

    const err = await expectFailure(conv.id);
    const after = await snap();

    eq("no Order created", after.orders, before.orders);
    eq("stock unchanged", after.stock, before.stock);
    check(
      "treated as a hash mismatch and re-summarised",
      err !== null && err.kind === "price-changed",
      err ? `kind=${err.kind}` : "no error",
    );
  }

  // ------------------------------------------- 7. WRONG PHASE
  await resetFixtures();
  console.log("\n--- 7. confirmation while not in AWAITING_CONFIRMATION ---");
  {
    const before = await snap();
    const conv = await seedConversation(baseDraft({ quantity: 1 }));
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { phase: "ORDER_COLLECTION" },
    });

    const err = await expectFailure(conv.id);
    const after = await snap();

    eq("no Order created", after.orders, before.orders);
    eq("stock unchanged", after.stock, before.stock);
    check(
      "rejected as gate-rejected",
      err !== null && err.kind === "gate-rejected",
      err ? `kind=${err.kind} detail=${err.detail}` : "no error",
    );
  }

  // ------------------------------------------- 8. FORCED FAILURE AFTER THE GATE
  await resetFixtures();
  console.log("\n--- 8. forced failure AFTER the gate update (rollback proof) ---");
  {
    const before = await snap();
    const conv = await seedConversation(baseDraft({ quantity: 1 }));

    let err: OrderCreationError | null = null;
    try {
      await createOrderFromConfirmedDraft({
        conversationId: conv.id,
        language: "fr",
        __testFailAfterGate: true,
      });
    } catch (e) {
      err = e instanceof OrderCreationError ? e : null;
    }
    const after = await snap();
    const st = await state(conv.id);

    check("the call threw", err !== null);
    eq("no Order created", after.orders, before.orders);
    eq("stock unchanged", after.stock, before.stock);
    // This is the A-09 guarantee: the gate update is rolled back too.
    eq("phase restored to AWAITING_CONFIRMATION", st.phase, "AWAITING_CONFIRMATION");
    eq("confirmation hash preserved", st.hash, conv.hash);
    check("draft preserved", st.hasDraft, JSON.stringify(st.draft));
  }

  // ------------------------------------------- 9. HOME DELIVERY ADDRESS
  await resetFixtures();
  console.log("\n--- 9. HOME delivery keeps the address (A-07) ---");
  {
    const before = await snap();
    const conv = await seedConversation(
      baseDraft({
        productId: otherId,
        quantity: 1,
        deliveryMethod: "HOME",
        deliveryAddress: "12 rue des Lilas",
      }),
    );

    const created = await createOrderFromConfirmedDraft({
      conversationId: conv.id,
      language: "fr",
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: created.orderId } });
    const after = await snap();

    eq("address kept for HOME", order.deliveryAddress, "12 rue des Lilas");
    eq("unit price is the other product's price", order.unitPrice.toString(), otherPrice);
    eq("the low-stock product untouched", after.stock, before.stock);
    eq("the other product decreased by one", before.otherStock - after.otherStock, 1);
  }

  console.log(`\n=============== ORDER INTEGRATION SUMMARY ===============`);
  console.log(`${passed}/${passed + failed} checks passed${failed ? `, ${failed} FAILED` : ""}`);
  for (const f of failures) console.log(`  FAILED: ${f}`);
  console.log(`\nOrders now in the database: ${await prisma.order.count()}`);
  console.log("Run `npm run test:restore-stock` to put stock back to the seed values.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED", (e as { constructor?: { name?: string } })?.constructor?.name, (e as Error).message);
  process.exit(1);
});