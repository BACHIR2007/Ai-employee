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

const ORDER_SELECT = {
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
} as const;

type OrderRecord = {
  id: string;
  createdAt: Date;
  quantity: number;
  size: string | null;
  color: string | null;
  customerName: string;
  customerPhone: string;
  deliveryMethod: "HOME" | "OFFICE";
  wilaya: string;
  deliveryAddress: string | null;
  unitPrice: { toString(): string };
  deliveryPrice: { toString(): string };
  status: "NOT_YET_CONFIRMED" | "CONFIRMED" | "CANCELLED";
  product: { name: string };
};

/** Maps a database row to the safe dashboard shape. Integer arithmetic only. */
export function toOrderRow(o: OrderRecord): OrderRow {
  const total = fromMinor(
    toMinor(o.unitPrice.toString()) * o.quantity + toMinor(o.deliveryPrice.toString()),
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
}

/** A-14: the orders of ONE visitor, newest first, capped at 100. */
export async function listVisitorOrders(visitorHash: string): Promise<OrderRow[]> {
  const rows = await prisma.order.findMany({
    where: { conversation: { visitorKeyHash: visitorHash } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: ORDER_SELECT,
  });
  return rows.map((o) => toOrderRow(o as unknown as OrderRecord));
}

/** Owner view: every order for the seeded business, newest first, capped at 100. */
export async function listAllOrders(): Promise<OrderRow[]> {
  const business = await prisma.business.findFirst({ select: { id: true } });
  if (!business) return [];

  const orders = await prisma.order.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: ORDER_SELECT,
  });
  return orders.map((o) => toOrderRow(o as unknown as OrderRecord));
}

/** One order, but only when it belongs to this visitor. */
export async function findVisitorOrder(
  orderId: string,
  visitorHash: string,
): Promise<OrderRow | null> {
  const row = await prisma.order.findFirst({
    where: { id: orderId, conversation: { visitorKeyHash: visitorHash } },
    select: ORDER_SELECT,
  });
  return row ? toOrderRow(row as unknown as OrderRecord) : null;
}

/** The owner view of a single order. */
export async function findOrderById(orderId: string): Promise<OrderRow | null> {
  const row = await prisma.order.findUnique({
    where: { id: orderId },
    select: ORDER_SELECT,
  });
  return row ? toOrderRow(row as unknown as OrderRecord) : null;
}