// Seed / reset core for the AI Employee MVP.
//
// ALL DATA BELOW IS DEMO DATA created for this demo only. Nothing here is real
// inventory, and the catalog must never be treated as authoritative for a real
// store.
//
// Spec section 5.2 requires "four to six believable products". The store name
// and catalog below were explicitly approved by the project owner.
//
// Idempotent by design: running this twice produces the same rows and no
// duplicates.
//
// The catalog itself lives in lib/seed-data.ts, which is the single source of
// truth for the seed values. The Day 11 reset (spec 10.4) and the manual stock
// restore helper read the same module, so the three can never disagree about
// what the seeded state is.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client";
import { DEMO_BUSINESS_NAME, DEMO_PRODUCTS } from "../lib/seed-data";
import type { SeedProduct } from "../lib/seed-data";

// Re-exported so existing importers of the seed data keep working.
export { DEMO_BUSINESS_NAME, DEMO_PRODUCTS };
export type { SeedProduct };

/**
 * Creates the demo business and catalog if missing, and restores each seeded
 * product's starting stock. Safe to call repeatedly.
 */
export async function seedDemoData(client: PrismaClient) {
  const business =
    (await client.business.findFirst({
      where: { name: DEMO_BUSINESS_NAME },
    })) ??
    (await client.business.create({
      data: { name: DEMO_BUSINESS_NAME },
    }));

  for (const product of DEMO_PRODUCTS) {
    const existing = await client.product.findFirst({
      where: { businessId: business.id, name: product.name },
    });

    if (existing) {
      // Restore starting stock so this doubles as a stock-only reset step.
      await client.product.update({
        where: { id: existing.id },
        data: { stockQuantity: product.stockQuantity },
      });
    } else {
      await client.product.create({
        data: {
          businessId: business.id,
          name: product.name,
          description: product.description,
          price: product.price,
          stockQuantity: product.stockQuantity,
          options: product.options,
        },
      });
    }
  }

  return business;
}

// CLI entry point: `npm run db:seed`
async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL as string,
  });
  const client = new PrismaClient({ adapter });

  try {
    await seedDemoData(client);
    console.log(
      `businesses=${await client.business.count()} products=${await client.product.count()}`,
    );
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1]?.includes("seed")) {
  main().catch((error) => {
    console.error(
      "Seed failed:",
      (error as { constructor?: { name?: string } })?.constructor?.name,
    );
    process.exit(1);
  });
}
