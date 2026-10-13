// Seed / reset core for the AI Employee MVP.
//
// PENDING APPROVAL: the specification does not name the demo store or its
// products, so the catalog below is a proposal awaiting sign-off (spec
// section 5.2 only says "four to six believable products").
//
// This function is deliberately idempotent: running it twice produces the
// same rows and no duplicates. The Day 11 reset endpoint (section 10.4) is
// expected to call this same function to restore starting stock after
// deleting demo conversations, messages and orders.
//
// Delivery fees are NOT seeded here. Per spec section 6 they live in a
// server-side code configuration module, not in the database.

import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client";

export const DEMO_BUSINESS_NAME = "Boutique Nour";

export type SeedProduct = {
  name: string;
  description: string;
  price: string;
  stockQuantity: number;
  options: { sizes: string[]; colors: string[] };
};

export const DEMO_PRODUCTS: SeedProduct[] = [
  {
    name: "T-shirt coton bio",
    description:
      "Coton bio 100%, coupe regular. Lavable a 30 degres.ideal pour la mi-saison.",
    price: "1800.00",
    stockQuantity: 40,
    options: { sizes: ["S", "M", "L", "XL"], colors: ["Blanc", "Noir", "Bleu"] },
  },
  {
    name: "Sweat a capuche",
    description:
      "Molleton gratté interieur, coupe unisexe. Ideal pour l'hiver et les journes de pluie.",
    price: "3500.00",
    stockQuantity: 25,
    options: { sizes: ["M", "L", "XL"], colors: ["Gris", "Noir", "Vert"] },
  },
  {
    name: "Baskets ville",
    description:
      "Semelle souple,-dessus respirant. Confortables pour la marche urbaine.",
    price: "7500.00",
    stockQuantity: 18,
    options: {
      sizes: ["40", "41", "42", "43", "44"],
      colors: ["Blanc", "Noir"],
    },
  },
  {
    name: "Djellaba traditionnelle homme",
    description:
      "Djellaba en tissu traditional, coupe droite. Broderie au col et aux poignets.",
    price: "5500.00",
    stockQuantity: 15,
    options: {
      sizes: ["M", "L", "XL", "XXL"],
      colors: ["Blanc", "Beige", "Marron"],
    },
  },
  {
    name: "T-shirt enfant",
    description:
      "Coton doux pour enfants, facile a enlever. Motifs colores, tailles 2 a 12 ans.",
    price: "1200.00",
    stockQuantity: 50,
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
      // Restore starting stock; keep the catalog authoritative in one place.
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
    const businessCount = await client.business.count();
    const productCount = await client.product.count();
    console.log(`Seeded. businesses=${businessCount} products=${productCount}`);
  } finally {
    await client.$disconnect();
  }
}

// Only run when executed directly, not when imported.
if (process.argv[1]?.includes("seed")) {
  main().catch((error) => {
    console.error("Seed failed:", (error as { constructor?: { name?: string } })?.constructor?.name);
    process.exit(1);
  });
}