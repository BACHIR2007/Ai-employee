// Owner reset from the command line. TRACKED. Run MANUALLY only.
//
// This is the owner's way to reset the demo without opening the web UI. It
// calls exactly the same lib/reset.ts that POST /api/admin/reset calls, so
// there is only one reset implementation to reason about.
//
// Safety:
//   - Without --confirm-reset it is a DRY RUN. It prints the row counts and the
//     stock and changes nothing at all. Nothing can be deleted by accident.
//   - It prints counts only. It never prints a connection string, a host, a
//     database name, an environment value or a passcode.
//   - It is not wired into the app: no route imports it, no component imports
//     it, nothing reads an environment variable to reach it. The web UI keeps
//     its own passcode gate.
//
// Usage:
//   npm run reset-demo                  dry run, prints the counts
//   npm run reset-demo -- --confirm-reset   actually resets
//
// PERMISSION NOTE: the Business row and the Product rows are never deleted, by
// this script or by the function it calls.

import "dotenv/config";
import { prisma } from "../lib/prisma";
import { resetDemoData } from "../lib/reset";
import { DEMO_PRODUCTS } from "../lib/seed-data";

const CONFIRM_FLAG = "--confirm-reset";

type Counts = {
  business: number;
  product: number;
  conversation: number;
  message: number;
  order: number;
};

async function readCounts(): Promise<Counts> {
  const [business, product, conversation, message, order] = await Promise.all([
    prisma.business.count(),
    prisma.product.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.order.count(),
  ]);
  return { business, product, conversation, message, order };
}

async function readStock(): Promise<Record<string, number>> {
  const rows = await prisma.product.findMany({
    select: { name: true, stockQuantity: true },
    orderBy: { name: "asc" },
  });
  return Object.fromEntries(rows.map((r) => [r.name, r.stockQuantity]));
}

function printCounts(label: string, c: Counts) {
  console.log(`${label}:`);
  console.log(`  businesses:    ${c.business}`);
  console.log(`  products:      ${c.product}`);
  console.log(`  conversations: ${c.conversation}`);
  console.log(`  messages:      ${c.message}`);
  console.log(`  orders:        ${c.order}`);
}

async function main() {
  const confirmed = process.argv.slice(2).includes(CONFIRM_FLAG);

  const before = await readCounts();
  const stockBefore = await readStock();

  console.log("AI Employee - demo data");
  console.log("");
  printCounts("before", before);
  console.log("stock before:");
  for (const [name, qty] of Object.entries(stockBefore)) {
    console.log(`  ${name}: ${qty}`);
  }
  console.log("");

  if (!confirmed) {
    console.log(`DRY RUN. Nothing was changed.`);
    console.log(
      `To actually reset (deletes every conversation, message and order, and restores the seeded stock), re-run with:`,
    );
    console.log(`  npm run reset-demo -- ${CONFIRM_FLAG}`);
    console.log("");
    console.log("The shop itself and its catalog are never deleted.");
    return;
  }

  const result = await resetDemoData();

  const after = await readCounts();
  const stockAfter = await readStock();

  console.log(`Reset done. Deleted ${result.deletedConversations} conversation(s), ${result.deletedMessages} message(s), ${result.deletedOrders} order(s); restored stock on ${result.productsRestocked} product(s).`);
  console.log("");
  printCounts("after", after);
  console.log("stock after:");
  for (const [name, qty] of Object.entries(stockAfter)) {
    console.log(`  ${name}: ${qty}`);
  }
  console.log("");

  // Prove the catalog survived, without printing anything sensitive.
  const expected = DEMO_PRODUCTS.length;
  const stockMatches = DEMO_PRODUCTS.every((p) => stockAfter[p.name] === p.stockQuantity);
  console.log(`catalog kept: ${after.business === before.business && after.product === before.product ? "yes" : "NO"}`);
  console.log(`stock back at the seeded values: ${stockMatches ? "yes" : "NO"} (expected ${expected} products)`);
  console.log("");
  console.log("Run this AFTER every test suite: order-integration writes real orders.");
}

main()
  .catch((e) => {
    // The error type only, never the message: a Prisma connection error can
    // carry the host, the user and the database name.
    const name = (e as { constructor?: { name?: string } })?.constructor?.name ?? "Error";
    console.error(`reset-demo failed: ${name}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
