// Restores the seeded demo stock quantities. TRACKED and run MANUALLY only.
//
// This script is deliberately NOT wired into the app: no route, no import, no
// environment variable. It only ever runs when a developer or a test types it.
//
// Safety:
//   - UPDATE only. It never deletes an order, a conversation or a message.
//   - It only sets the five seeded products back to their configured starting
//     quantities, so it can never invent stock for another row.
//   - Orders are left alone on purpose. Day 10 owns cancellation and stock
//     restoration; Day 11 owns the demo reset.
//
// Usage: npm run test:restore-stock

import { prisma } from "../lib/prisma";

/** The seed values in prisma/seed.ts. Kept explicit, never derived. */
const SEED_STOCK: Record<string, number> = {
  "T-shirt coton bio": 20,
  "T-shirt enfant": 25,
  "Sweat à capuche": 12,
  "Baskets nike": 8,
  "jeans homme": 3,
};

async function main() {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, stockQuantity: true },
    orderBy: { name: "asc" },
  });

  console.log("before:");
  for (const p of products) console.log(`  ${p.name} | ${p.stockQuantity}`);

  let restored = 0;
  for (const p of products) {
    const target = SEED_STOCK[p.name];
    if (target === undefined) {
      console.log(`  skipped ${p.name}: not a seeded product`);
      continue;
    }
    if (p.stockQuantity === target) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { stockQuantity: target },
    });
    restored += 1;
    console.log(`  restored ${p.name}: ${p.stockQuantity} -> ${target}`);
  }

  console.log("after:");
  for (const p of await prisma.product.findMany({
    select: { name: true, stockQuantity: true },
    orderBy: { name: "asc" },
  })) {
    console.log(`  ${p.name} | ${p.stockQuantity}`);
  }
  console.log(`Orders untouched: ${await prisma.order.count()}`);
  console.log(restored === 0 ? "nothing to restore" : `restored ${restored} product(s)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED", (e as { constructor?: { name?: string } })?.constructor?.name);
  process.exit(1);
});