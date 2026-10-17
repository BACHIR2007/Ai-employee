// Canonical normalization, trusted pricing, the localized order summary and
// the canonical confirmation hash.
//
// Spec 7.3, 8.5, 9, 10.1 and 13.1, plus addendum A-01, A-04, A-07, A-09.
//
// The backend is the only authority for prices, fees, totals and identities.
// Gemini never supplies them.

import { createHash } from "node:crypto";
import { resolveWilaya, WILAYAS } from "./wilayas";
import { getDeliveryPrice, type DeliveryMethod } from "./delivery";
import { normalizePhone, type Draft } from "./draft";
import { DELIVERY_METHOD_LABELS, FIELD_LABELS, type Language } from "./templates";

export type CatalogProduct = {
  id: string;
  name: string;
  priceDzd: string;
  stockQuantity: number;
  sizes: string[];
  colors: string[];
};

/** A draft reduced to canonical values, safe to hash and to show. */
export type CanonicalDraft = {
  productId: string;
  quantity: number;
  size: string | null;
  color: string | null;
  customerName: string;
  customerPhone: string;
  deliveryMethod: DeliveryMethod;
  wilaya: string;
  wilayaNameAr: string;
  deliveryAddress: string | null;
};

export type TrustedPricing = {
  productName: string;
  unitPrice: string;
  deliveryPrice: string;
  itemsTotal: string;
  total: string;
  stockQuantity: number;
};

export type PreparedOrder = {
  draft: CanonicalDraft;
  pricing: TrustedPricing;
  hash: string;
  summary: string;
};

/** DZD amounts are handled as integer minor units to avoid float drift. */
/** Parses a DZD amount into integer minor units. Exported for the dashboard. */
export function toMinor(value: string): number {
  const [whole, frac = ""] = value.trim().split(".");
  const cents = Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(Number(whole)) || !Number.isFinite(cents)) {
    throw new Error("invalid-amount");
  }
  return Number(whole) * 100 + cents;
}
/**
 * Renders an amount in minor units as the canonical DZD string.
 *
 * A zero fraction is dropped, so 420000 reads "4200" and not "4200.00". This
 * single function produces BOTH the numbers shown in the summary and the
 * numbers hashed by A-09, so the confirmed value is literally the displayed
 * string rather than merely an equal one.
 */
/** Renders integer minor units back to a DZD string. Exported for the dashboard. */
export function fromMinor(minor: number): string {
  const whole = Math.trunc(minor / 100);
  const cents = minor % 100;
  return cents === 0 ? String(whole) : `${whole}.${String(cents).padStart(2, "0")}`;
}

function canonicalOption(value: string | undefined, allowed: string[]): string | null {
  if (value === undefined) return null;
  const fold = (s: string) =>
    s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_-]+/g, "");
  for (const option of allowed) if (fold(option) === fold(value)) return option;
  return null;
}

export type NormalizeResult =
  | { ok: true; draft: CanonicalDraft }
  | { ok: false; reason: "incomplete" | "unknown-wilaya" | "invalid-phone" | "unknown-fee" | "invalid-product" | "invalid-quantity" };

/**
 * Step 1.1: reduce a stored draft to canonical values, or explain why it is
 * not yet summarizable. Never trusts the model for identity or price.
 */
export function normalizeDraftForOrder(
  draft: Draft,
  catalog: CatalogProduct[],
): NormalizeResult {
  if (!draft.productId) return { ok: false, reason: "incomplete" };
  const product = catalog.find((p) => p.id === draft.productId);
  if (!product) return { ok: false, reason: "invalid-product" };

  if (
    draft.quantity === undefined ||
    !Number.isInteger(draft.quantity) ||
    draft.quantity < 1
  ) {
    return { ok: false, reason: "invalid-quantity" };
  }

  const size = canonicalOption(draft.size, product.sizes);
  const color = canonicalOption(draft.color, product.colors);

  // Spec 8.5: an option the product actually has is required.
  if (product.sizes.length > 0 && !size) return { ok: false, reason: "incomplete" };
  if (product.colors.length > 0 && !color) return { ok: false, reason: "incomplete" };

  const customerName = (draft.customerName ?? "").trim();
  if (customerName.length < 2) return { ok: false, reason: "incomplete" };

  const phone = normalizePhone(draft.customerPhone ?? "");
  if (!phone) return { ok: false, reason: "invalid-phone" };

  if (draft.deliveryMethod !== "HOME" && draft.deliveryMethod !== "OFFICE") {
    return { ok: false, reason: "incomplete" };
  }

  // A-01: resolve the wilaya, then keep both canonical names.
  const wilaya = draft.wilaya ? resolveWilaya(draft.wilaya) : null;
  if (!wilaya) return { ok: false, reason: "unknown-wilaya" };

  // A-07: the address exists only for HOME.
  const address =
    draft.deliveryMethod === "HOME"
      ? ((draft.deliveryAddress ?? "").trim() || null)
      : null;
  if (draft.deliveryMethod === "HOME" && !address) {
    return { ok: false, reason: "incomplete" };
  }

  return {
    ok: true,
    draft: {
      productId: product.id,
      quantity: draft.quantity,
      size,
      color,
      customerName,
      customerPhone: phone,
      deliveryMethod: draft.deliveryMethod,
      wilaya: wilaya.nameFr,
      wilayaNameAr: wilaya.nameAr,
      deliveryAddress: address,
    },
  };
}

/** Step 1.2: trusted pricing. A missing fee is never summarised (A-09). */
export function buildTrustedPricing(
  draft: CanonicalDraft,
  catalog: CatalogProduct[],
): TrustedPricing | null {
  const product = catalog.find((p) => p.id === draft.productId);
  if (!product) return null;

  const deliveryPrice = getDeliveryPrice(
    WILAYAS.find((w) => w.nameFr === draft.wilaya)?.code ?? -1,
    draft.deliveryMethod,
  );
  // An unknown wilaya or a missing fee must not produce a summary.
  if (deliveryPrice === null) return null;

  const unitMinor = toMinor(product.priceDzd);
  const itemsMinor = unitMinor * draft.quantity;
  const deliveryMinor = toMinor(String(deliveryPrice));

  return {
    productName: product.name,
    unitPrice: fromMinor(unitMinor),
    deliveryPrice: fromMinor(deliveryMinor),
    itemsTotal: fromMinor(itemsMinor),
    total: fromMinor(itemsMinor + deliveryMinor),
    stockQuantity: product.stockQuantity,
  };
}

/**
 * Step 1.3: SHA-256 over canonical JSON of the normalized draft plus the
 * three amounts exactly as shown in the summary (A-09).
 *
 * Keys are serialized in a fixed order rather than sorted at runtime, so an
 * equivalent draft hashes identically regardless of input key order.
 */
export function buildConfirmationHash(
  draft: CanonicalDraft,
  pricing: TrustedPricing,
): string {
  const canonical = JSON.stringify({
    productId: draft.productId,
    quantity: draft.quantity,
    size: draft.size,
    color: draft.color,
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    deliveryMethod: draft.deliveryMethod,
    wilaya: draft.wilaya,
    wilayaNameAr: draft.wilayaNameAr,
    deliveryAddress: draft.deliveryAddress,
    unitPrice: pricing.unitPrice,
    deliveryPrice: pricing.deliveryPrice,
    total: pricing.total,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Step 1.2: the 13.1 summary, built entirely from server-side values.
 *
 * A-01 picks the Arabic or the French canonical wilaya name. A-08 supplies the
 * delivery-method label. Spec 13.1 requires that an option which does not apply
 * has its label omitted rather than rendered as a blank, and that office
 * delivery omits the home address line entirely (A-07).
 */
export function buildSummary(
  draft: CanonicalDraft,
  pricing: TrustedPricing,
  language: Language,
): string {
  const method = DELIVERY_METHOD_LABELS[language][draft.deliveryMethod];
  // A-01: the Arabic canonical name when the conversation is Arabic.
  const wilaya = language === "ar" ? draft.wilayaNameAr : draft.wilaya;

  // Spec 13.1: keep only the labels that actually apply, so an inapplicable
  // option is omitted instead of showing a blank. When both apply, the join
  // reproduces the spec sentence exactly.
  const parts: string[] = [];
  if (draft.size) parts.push(`${OPTION_LABELS[language].size} ${draft.size}`);
  if (draft.color) parts.push(`${OPTION_LABELS[language].color} ${draft.color}`);
  const options = parts.join(language === "ar" ? "، " : ", ");

  // A-07: the address line exists only for HOME, and is dropped whole otherwise.
  const addressLine = draft.deliveryAddress
    ? `, ${FIELD_LABELS[language].address}: ${draft.deliveryAddress}`
    : "";

  return SUMMARY_TEXT[language]
    .replace("{product}", pricing.productName)
    .replace("{quantity}", String(draft.quantity))
    .replace("{options}", options)
    .replace("{customerName}", draft.customerName)
    .replace("{customerPhone}", draft.customerPhone)
    .replace("{deliveryMethod}", method)
    .replace("{wilaya}", wilaya)
    .replace("{addressLine}", addressLine)
    .replace("{itemsTotal}", pricing.itemsTotal)
    .replace("{deliveryPrice}", pricing.deliveryPrice)
    .replace("{total}", pricing.total);
}

/** The exact size/color labels used inside the spec 13.1 sentences. */
const OPTION_LABELS: Record<Language, { size: string; color: string }> = {
  ar: { size: "المقاس", color: "اللون" },
  fr: { size: "taille", color: "couleur" },
  en: { size: "size", color: "color" },
};

/**
 * Spec 13.1, preserved verbatim. The option span "المقاس {size}، اللون {color}"
 * is written as the single {options} placeholder because an option that does not
 * apply must lose its label AND its separator; with both options present the
 * rendered text is identical to the spec sentence.
 */
const SUMMARY_TEXT: Record<Language, string> = {
  ar: "راجع طلبك من فضلك: {product}، الكمية {quantity}، {options}. الاسم: {customerName}، الهاتف: {customerPhone}، التوصيل: {deliveryMethod} إلى {wilaya}{addressLine}. سعر المنتجات: {itemsTotal} دج، التوصيل: {deliveryPrice} دج، المجموع: {total} دج. إذا كان كل شيء صحيحًا، أكّد الطلب. إذا أردت تغيير شيء، أخبرني.",
  fr: "Vérifiez votre commande : {product}, quantité {quantity}, {options}. Nom : {customerName}, téléphone : {customerPhone}, livraison : {deliveryMethod} à {wilaya}{addressLine}. Produits : {itemsTotal} DA, livraison : {deliveryPrice} DA, total : {total} DA. Si tout est correct, confirmez la commande. Pour modifier un détail, dites-le-moi.",
  en: "Please review your order: {product}, quantity {quantity}, {options}. Name: {customerName}, phone: {customerPhone}, delivery: {deliveryMethod} to {wilaya}{addressLine}. Items: {itemsTotal} DZD, delivery: {deliveryPrice} DZD, total: {total} DZD. If everything is correct, confirm the order. If you want to change something, tell me.",
};

/** Why a draft cannot yet be summarized, hashed or confirmed. */
export type BlockedReason = Exclude<NormalizeResult, { ok: true }>["reason"] | "unknown-fee" | "quantity-too-high-stock";

export type PrepareResult =
  | { ok: true; order: PreparedOrder }
  | { ok: false; blocked: BlockedReason };

/**
 * The single entry point the route uses: normalize, price from the database,
 * check stock, then hash and render the localized 13.1 summary.
 *
 * Every failure returns a reason rather than a partial result, so a caller
 * cannot accidentally summarize or hash a draft that is not ready.
 */
export function prepareOrder(
  draft: Draft,
  catalog: CatalogProduct[],
  language: Language,
): PrepareResult {
  const normalized = normalizeDraftForOrder(draft, catalog);
  if (!normalized.ok) return { ok: false, blocked: normalized.reason };

  const pricing = buildTrustedPricing(normalized.draft, catalog);
  // No trusted fee means no summary and no hash (A-09).
  if (!pricing) return { ok: false, blocked: "unknown-fee" };

  // Spec 9: a quantity above current stock is never summarized. Stock itself is
  // untouched; only the summary is refused.
  if (normalized.draft.quantity > pricing.stockQuantity) {
    return { ok: false, blocked: "quantity-too-high-stock" };
  }

  return {
    ok: true,
    order: {
      draft: normalized.draft,
      pricing,
      hash: buildConfirmationHash(normalized.draft, pricing),
      summary: buildSummary(normalized.draft, pricing, language),
    },
  };
}
