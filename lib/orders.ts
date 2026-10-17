// Spec 12.6: the dashboard read model.
//
// One place builds the order rows, so the API and the page cannot drift. Only
// the fields spec 12.6 lists are selected, and the total is computed with the
// same integer minor-unit arithmetic the confirmation hash uses, never floats.
//
// Never selects rawAiOutput, Message rows or any conversation content.

import { prisma } from "./prisma";
import { toMinor, fromMinor } from "./order-summary";

/** Spec 14.2 asks for a short reference; the first 8 characters are enough. */
export function shortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Africa/Algiers, per addendum A-10. Rendered on the server only. */
const TIME_ZONE = "Africa/Algiers";

export function formatOrderTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export type OrderRow = {
  id: string;
  reference: string;
  createdAt: string;
  createdAtLabel: string;
  productName: string;
  quantity: number;
  size: string | null;
  color: string | null;
  customerName: string;
  customerPhone: string;
  deliveryMethod: "HOME" | "OFFICE";
  wilaya: string;
  /** A-07: always null for OFFICE, so the UI never renders an address line. */
  deliveryAddress: string | null;
  unitPrice: string;
  deliveryPrice: string;
  total: string;
  status: "NOT_YET_CONFIRMED" | "CONFIRMED" | "CANCELLED";
};

/** Orders for the seeded business, newest first, capped at 100. */
export async function listOrders(): Promise<OrderRow[]> {
  const business = await prisma.business.findFirst({
    select: { id: true },
  });
  if (!business) return [];

  const orders = await prisma.order.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      quantity: true,
      size: true,
      color: true,
      customerName: true,
      customerPhone: true,
      deliveryMethod: true,
      wilaya: true,
      deliveryAddress: true,
      unitPrice: true,
      deliveryPrice: true,
      status: true,
      product: { select: { name: true } },
    },
  });

  return orders.map((o) => {
    // Integer minor units, so 3 x 1800.00 + 600.00 is exactly 6000.00.
    const total = fromMinor(
      toMinor(o.unitPrice.toString()) * o.quantity +
        toMinor(o.deliveryPrice.toString()),
    );
    return {
      id: o.id,
      reference: shortReference(o.id),
      createdAt: o.createdAt.toISOString(),
      createdAtLabel: formatOrderTime(o.createdAt),
      productName: o.product.name,
      quantity: o.quantity,
      size: o.size,
      color: o.color,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryMethod: o.deliveryMethod,
      wilaya: o.wilaya,
      // Defensive: an OFFICE row can never carry an address.
      deliveryAddress: o.deliveryMethod === "OFFICE" ? null : o.deliveryAddress,
      unitPrice: fromMinor(toMinor(o.unitPrice.toString())),
      deliveryPrice: fromMinor(toMinor(o.deliveryPrice.toString())),
      total,
      status: o.status,
    };
  });
}