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
// duplicates. The Day 11 reset endpoint (spec section 10.4) is expected to call
// this same function to restore starting stock after clearing demo
// conversations, messages and orders.
//
// Delivery fees are NOT seeded. Per spec section 6 they live in a server-side
// code configuration module, not in the database.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client";

export const DEMO_BUSINESS_NAME = "Boutique elegance";

export type SeedProduct = {
  name: string;
  description: string;
  price: string;
  stockQuantity: number;
  options: { sizes: string[]; colors: string[] };
};

// DEMO DATA - approved catalog. Stock levels are intentionally low so the
// out-of-stock and quantity-too-high paths are easy to demonstrate.
export const DEMO_PRODUCTS: SeedProduct[] = [
  {
    name: "T-shirt coton bio",
    description:
      "Coton bio 100 %, coupe régulière. Lavable à 30 °C. Idéal pour la mi-saison.",
    price: "1800.00",
    stockQuantity: 20,
    options: { sizes: ["S", "M", "L", "XL"], colors: ["Blanc", "Noir", "Bleu"] },
  },
  {
    name: "Sweat à capuche",
    description:
      "Molleton gratté à l'intérieur, coupe unisexe. Idéal pour l'hiver et les journées de pluie.",
    price: "3500.00",
    stockQuantity: 12,
    options: { sizes: ["M", "L", "XL"], colors: ["Gris", "Noir", "Vert"] },
  },
  {
    name: "Baskets nike",
    description:
      "Semelle souple et dessus respirant. Confortables pour la marche urbaine.",
    price: "7500.00",
    stockQuantity: 8,
    options: {
      sizes: ["40", "41", "42", "43", "44"],
      colors: ["Blanc", "Noir"],
    },
  },
  {
    name: "jeans homme",
    description:
      "Denim stretch, coupe droite. Cinq poches, bouton et fermeture éclair.",
    price: "5500.00",
    stockQuantity: 3,
    options: {
      sizes: ["M", "L", "XL", "XXL"],
      colors: ["Blanc", "Beige", "Marron"],
    },
  },
  {
    name: "T-shirt enfant",
    description:
      "Coton doux, facile à enlever. Motifs colorés, tailles 2 à 12 ans.",
    price: "1200.00",
    stockQuantity: 25,
    options: {
      sizes: ["2-4", "6-8", "10-12"],
      colors: ["Jaune", "Rose", "Bleu"],
    },
  },
];

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
      // Restore starting stock so this doubles as the Day 11 reset step.
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