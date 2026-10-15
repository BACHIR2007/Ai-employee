// Builds the context package sent to Gemini on every request (spec 8.1).
//
// The catalog and stock are read FRESH from the database on every request.
// Nothing here is cached: the spec states product data in the database is the
// source of truth, and a stale price or stock count would be a correctness bug.

import type { PrismaClient } from "../generated/prisma/client";
import { WILAYAS } from "./wilayas";
import {
  OFFICE_DELIVERY_FEE_DA,
  HOME_DELIVERY_SURCHARGE_DA,
  getDeliveryPrice,
} from "./delivery";

/** Spec 5.4 / 8.1: only the most recent 12 messages. */
export const HISTORY_LIMIT = 12;

export type ChatContext = {
  business: { name: string };
  catalog: {
    id: string;
    name: string;
    description: string;
    priceDzd: string;
    stockQuantity: number;
    sizes: string[];
    colors: string[];
  }[];
  deliveryConfig: {
    supportedWilayaCount: number;
    officeFeeTiersDzd: number[];
    homeSurchargeDzd: number;
    note: string;
  };
  feeTable: {
    code: number;
    nameFr: string;
    nameAr: string;
    officeDzd: number | null;
    homeDzd: number | null;
  }[];
  conversation: {
    id: string;
    phase: string;
    missingFields: string[];
  };
  history: { sender: "CUSTOMER" | "AI"; content: string }[];
};

/**
 * Spec 8.1 includes the wilaya allowlist / delivery config summary. Sending
 * all 69 wilayas would be wasteful, and A-01 states the model never validates
 * a wilaya anyway, so a compact summary is what the spec means here.
 */
function buildDeliveryConfig() {
  const tiers = [...new Set(Object.values(OFFICE_DELIVERY_FEE_DA))].sort(
    (a, b) => a - b,
  );
  return {
    supportedWilayaCount: WILAYAS.length,
    officeFeeTiersDzd: tiers,
    homeSurchargeDzd: HOME_DELIVERY_SURCHARGE_DA,
    note: "Office delivery costs one of the listed tiers depending on the wilaya; home delivery adds the surcharge. The backend computes the exact fee. No discounts exist.",
  };
}

/**
 * STEP 2B-a: the per-wilaya fee table, generated from lib/wilayas.ts and
 * lib/delivery.ts so the two can never drift apart. The model quotes fees
 * only from this table.
 */
export function buildFeeTable() {
  return WILAYAS.map((w) => ({
    code: w.code,
    nameFr: w.nameFr,
    nameAr: w.nameAr,
    officeDzd: getDeliveryPrice(w.code, "OFFICE"),
    homeDzd: getDeliveryPrice(w.code, "HOME"),
  }));
}

/**
 * Reads the catalog fresh, then loads the bounded history.
 *
 * A-06: the history includes customer messages and AI rows with
 * aiCallStatus = SUCCEEDED and non-null content only. PENDING and FAILED rows
 * are excluded.
 */
export async function buildChatContext(
  prisma: PrismaClient,
  businessId: string,
  conversationId: string,
  phase: string,
  missingFields: string[],
): Promise<ChatContext> {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { name: true },
  });

  const products = await prisma.product.findMany({
    where: { businessId },
    orderBy: { name: "asc" },
  });

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      OR: [
        { senderType: "CUSTOMER" },
        { senderType: "AI", aiCallStatus: "SUCCEEDED", content: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { senderType: true, content: true },
  });

  return {
    business: { name: business.name },
    catalog: products.map((p) => {
      const options = (p.options ?? {}) as { sizes?: string[]; colors?: string[] };
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        priceDzd: p.price.toString(),
        stockQuantity: p.stockQuantity,
        sizes: options.sizes ?? [],
        colors: options.colors ?? [],
      };
    }),
    deliveryConfig: buildDeliveryConfig(),
    feeTable: buildFeeTable(),
    conversation: { id: conversationId, phase, missingFields },
    history: messages
      .map((m) => ({
        sender: m.senderType as "CUSTOMER" | "AI",
        content: m.content ?? "",
      }))
      .reverse(),
  };
}