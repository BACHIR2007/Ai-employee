// THE single source of truth for the demo business and catalog.
//
// Spec 10.4 asks the reset to "restore the seeded demo state", so the seed
// values have to live in exactly one place. The seed script, the manual stock
// restore helper and the Day 11 reset all read from here, which is what stops
// the three from drifting apart.
//
// ALL DATA BELOW IS DEMO DATA created for this demo only. Nothing here is real
// inventory, and the catalog must never be treated as authoritative for a real
// store.
//
// Delivery fees are NOT seeded. Per spec 6 they live in a server-side code
// configuration module, not in the database.

export const DEMO_BUSINESS_NAME = "Boutique elegance";

export type SeedProduct = {
  name: string;
  description: string;
  price: string;
  /**
   * The starting quantity for a fresh demo. Chosen in addendum A-15 so judges
   * cannot run out mid-demo, except jeans homme, which deliberately stays low
   * so the out-of-stock and price-changed paths stay easy to show.
   */
  stockQuantity: number;
  options: { sizes: string[]; colors: string[] };
};

/**
 * DEMO DATA - the approved catalog. Names, prices, descriptions, sizes and
 * colours are unchanged from the original seed; only the starting stock moved,
 * per addendum A-15.
 */
export const DEMO_PRODUCTS: SeedProduct[] = [
  {
    name: "T-shirt coton bio",
    description:
      "Coton bio 100 %, coupe régulière. Lavable à 30 °C. Idéal pour la mi-saison.",
    price: "1800.00",
    stockQuantity: 40,
    options: { sizes: ["S", "M", "L", "XL"], colors: ["Blanc", "Noir", "Bleu"] },
  },
  {
    name: "Sweat à capuche",
    description:
      "Molleton gratté à l'intérieur, coupe unisexe. Idéal pour l'hiver et les journées de pluie.",
    price: "3500.00",
    stockQuantity: 30,
    options: { sizes: ["M", "L", "XL"], colors: ["Gris", "Noir", "Vert"] },
  },
  {
    name: "Baskets nike",
    description:
      "Semelle souple et dessus respirant. Confortables pour la marche urbaine.",
    price: "7500.00",
    stockQuantity: 30,
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
    // Deliberately low (A-15) so the out-of-stock demo always works.
    stockQuantity: 6,
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
    stockQuantity: 40,
    options: {
      sizes: ["2-4", "6-8", "10-12"],
      colors: ["Jaune", "Rose", "Bleu"],
    },
  },
];

/** Starting stock by product name, for callers keyed by name. */
export const SEED_STOCK_BY_NAME: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(DEMO_PRODUCTS.map((p) => [p.name, p.stockQuantity])),
);

/** The starting stock of a seeded product, or null when the name is unknown. */
export function seedStockFor(name: string): number | null {
  return Object.prototype.hasOwnProperty.call(SEED_STOCK_BY_NAME, name)
    ? SEED_STOCK_BY_NAME[name]
    : null;
}
