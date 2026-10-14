import { prisma } from "@/lib/prisma";

// Spec 12.2: public, optional/simple. Returns only public product information:
// ID, name, short description, price and a safe availability indicator.
// Read fresh on every request, with no caching.
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

    return Response.json({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price.toString(),
        available: product.stockQuantity > 0,
      })),
    });
  } catch {
    return Response.json({ products: [] }, { status: 200 });
  }
}