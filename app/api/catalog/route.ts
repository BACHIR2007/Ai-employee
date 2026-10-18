import { prisma } from "@/lib/prisma";

// Spec 12.2: public, optional/simple. Returns only public product information:
// ID, name, short description, price and a safe availability indicator.
// Read fresh on every request, with no caching.
//
// The data is public by design, but it still must not be cached by a shared
// proxy: a stale price would contradict the price the backend actually quotes,
// and prices feed money.
const CATALOG_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stockQuantity: true,
      },
      orderBy: { name: "asc" },
    });

    return Response.json(
      {
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price.toString(),
          available: product.stockQuantity > 0,
        })),
      },
      { status: 200, headers: CATALOG_HEADERS },
    );
  } catch {
    // Generic, and deliberately indistinguishable from an empty catalog.
    return Response.json({ products: [] }, { status: 200, headers: CATALOG_HEADERS });
  }
}