// Order draft field validation, merge and missing-field computation.
//
// Spec 7.2, 8.5, 9.2, 9.3, 9.4 and addendum A-01, A-02, A-04, A-07.
//
// The backend is the only authority: the model proposes, this module decides.
// A field that fails validation is rejected on its own and never discards the
// fields that are already valid.

import { resolveWilaya } from "./wilayas";

export type Draft = {
  productId?: string;
  quantity?: number;
  size?: string;
  color?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryMethod?: "HOME" | "OFFICE";
  wilaya?: string;
  deliveryAddress?: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  priceDzd: string;
  stockQuantity: number;
  sizes: string[];
  colors: string[];
};

/** Rejection reasons, mapped to a section 13 template by the caller. */
export type FieldError =
  | "product-not-found"
  | "invalid-size"
  | "invalid-color"
  | "invalid-quantity"
  | "quantity-too-high"
  | "invalid-name"
  | "invalid-phone"
  | "unknown-wilaya"
  | "invalid-address"
  | "address-not-allowed";

export type MergeResult = {
  draft: Draft;
  errors: { field: string; reason: FieldError }[];
  /** A-04: the product changed and at least one field had to be cleared. */
  productChangedAndCleared: boolean;
  cleared: string[];
};

/** A-02: normalize then validate an Algerian mobile number. */
export function normalizePhone(input: string): string | null {
  let value = input;

  // 1. Arabic-Indic and Extended Arabic-Indic digits become ASCII.
  value = value.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  value = value.replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  // 2. Remove spaces, dots, dashes, slashes and parentheses.
  value = value.replace(/[\s.\-()/]/g, "");

  // 3. Strip an international prefix, then guarantee exactly one leading zero.
  if (value.startsWith("00213")) value = value.slice(5);
  else if (value.startsWith("+213")) value = value.slice(4);
  if (value.startsWith("213")) value = value.slice(3);
  if (!value.startsWith("0")) value = `0${value}`;

  // 4. Spec 9.3: 05, 06 or 07 then eight digits.
  return /^0[567][0-9]{8}$/.test(value) ? value : null;
}

/**
 * Case-insensitive and accent-insensitive option match (step 4 safety net).
 * "Blanc" and "blanc" and "éclair" style differences both collapse, and the
 * catalog's own canonical spelling is what gets stored.
 */
function safeOptionMatch(value: string, allowed: string[]): string | null {
  const fold = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, "");

  const target = fold(value);
  for (const option of allowed) {
    if (fold(option) === target) return option;
  }
  return null;
}

/**
 * Validate a proposed payload against trusted catalog data and merge the
 * fields that pass into the existing draft.
 */
export function mergeDraft(
  current: Draft,
  payload: Record<string, unknown>,
  catalog: CatalogProduct[],
): MergeResult {
  const draft: Draft = { ...current };
  const errors: { field: string; reason: FieldError }[] = [];
  const cleared: string[] = [];
  let productChanged = false;

  const byId = new Map(catalog.map((p) => [p.id, p]));
  const product = (v: string) => byId.get(v) ?? null;

  // Every payload key is nullable: null (or a non-string/non-number) means the
  // customer did not mention it, so it is skipped and the stored value is kept.
  const said = (value: unknown): boolean =>
    value !== null && value !== undefined && value !== "";

  // --- productId ---
  if (typeof payload.productId === "string" && payload.productId.length > 0) {
    const found = product(payload.productId);
    if (!found) {
      errors.push({ field: "productId", reason: "product-not-found" });
    } else if (draft.productId !== found.id) {
      // A-04: the product changed. Keep customer fields, revalidate the rest.
      productChanged = true;
      draft.productId = found.id;
      if (draft.size && !found.sizes.includes(draft.size)) {
        delete draft.size;
        cleared.push("size");
      }
      if (draft.color && !found.colors.includes(draft.color)) {
        delete draft.color;
        cleared.push("color");
      }
      if (draft.quantity !== undefined && draft.quantity > found.stockQuantity) {
        delete draft.quantity;
        cleared.push("quantity");
      }
    }
  }

  const currentProduct = draft.productId ? product(draft.productId) : null;

  // --- quantity ---
  if (said(payload.quantity)) {
    const raw = payload.quantity;
    const isInt = typeof raw === "number" && Number.isInteger(raw);
    // A-05: the model must send an integer. Accept a numeric string once.
    const asNumber =
      isInt ? raw : typeof raw === "string" && /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;

    if (!isInt && Number.isNaN(asNumber)) {
      errors.push({ field: "quantity", reason: "invalid-quantity" });
    } else if (asNumber < 1) {
      errors.push({ field: "quantity", reason: "invalid-quantity" });
    } else if (currentProduct && asNumber > currentProduct.stockQuantity) {
      // Spec 9.2: rejected, never silently reduced.
      errors.push({ field: "quantity", reason: "quantity-too-high" });
    } else {
      draft.quantity = asNumber;
    }
  }

  // --- size / color: must match the selected product's options exactly ---
  if (said(payload.size) && typeof payload.size === "string") {
    if (!currentProduct) {
      errors.push({ field: "size", reason: "product-not-found" });
    } else {
      const match = safeOptionMatch(payload.size, currentProduct.sizes);
      if (match) draft.size = match;
      else errors.push({ field: "size", reason: "invalid-size" });
    }
  }

  if (said(payload.color) && typeof payload.color === "string") {
    if (!currentProduct) {
      errors.push({ field: "color", reason: "product-not-found" });
    } else {
      const match = safeOptionMatch(payload.color, currentProduct.colors);
      if (match) draft.color = match;
      else errors.push({ field: "color", reason: "invalid-color" });
    }
  }

  // --- customerName: 2-80 characters, no control characters ---
  if (said(payload.customerName) && typeof payload.customerName === "string") {
    const name = payload.customerName.trim();
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      errors.push({ field: "customerName", reason: "invalid-name" });
    } else {
      draft.customerName = name;
    }
  }

  // --- customerPhone: A-02 ---
  if (said(payload.customerPhone) && typeof payload.customerPhone === "string") {
    const phone = normalizePhone(payload.customerPhone);
    if (!phone) errors.push({ field: "customerPhone", reason: "invalid-phone" });
    else draft.customerPhone = phone;
  }

  // --- wilaya: A-01, resolved by the backend ---
  if (said(payload.wilaya) && typeof payload.wilaya === "string") {
    const resolved = resolveWilaya(payload.wilaya);
    if (!resolved) errors.push({ field: "wilaya", reason: "unknown-wilaya" });
    else draft.wilaya = resolved.nameFr;
  }

  // --- deliveryMethod, and the A-07 address rules ---
  if (payload.deliveryMethod === "HOME" || payload.deliveryMethod === "OFFICE") {
    const next = payload.deliveryMethod;
    if (draft.deliveryMethod && draft.deliveryMethod !== next) {
      // A-07: switching HOME <-> OFFICE clears or re-requires the address.
      delete draft.deliveryAddress;
      cleared.push("deliveryAddress");
    }
    draft.deliveryMethod = next;
    if (next === "OFFICE") delete draft.deliveryAddress;
  }

  if (said(payload.deliveryAddress) && typeof payload.deliveryAddress === "string") {
    if (draft.deliveryMethod === "OFFICE") {
      errors.push({ field: "deliveryAddress", reason: "address-not-allowed" });
    } else {
      const address = payload.deliveryAddress.trim();
      if (address.length < 5 || address.length > 200) {
        errors.push({ field: "deliveryAddress", reason: "invalid-address" });
      } else {
        draft.deliveryAddress = address;
      }
    }
  } else if (payload.deliveryAddress === null && draft.deliveryMethod === "OFFICE") {
    delete draft.deliveryAddress;
  }

  return {
    draft,
    errors,
    productChangedAndCleared: productChanged && cleared.length > 0,
    cleared,
  };
}

/**
 * Spec 8.5: required fields for a one-product order, in the order they must
 * be asked. The backend computes this; the model never decides an order is
 * complete.
 */
export function computeMissingFields(
  draft: Draft,
  catalog: CatalogProduct[],
): string[] {
  const missing: string[] = [];
  const byId = new Map(catalog.map((p) => [p.id, p]));

  if (!draft.productId) return ["productId"];

  const product = byId.get(draft.productId);
  if (!product) return ["productId"];

  if (draft.quantity === undefined) missing.push("quantity");

  // Only options the product actually has are required.
  if (product.sizes.length > 0 && !draft.size) missing.push("size");
  if (product.colors.length > 0 && !draft.color) missing.push("color");

  if (!draft.customerName) missing.push("customerName");
  if (!draft.customerPhone) missing.push("customerPhone");
  if (!draft.deliveryMethod) missing.push("deliveryMethod");
  if (!draft.wilaya) missing.push("wilaya");

  // Spec 8.5: the address is only required for HOME delivery.
  if (draft.deliveryMethod === "HOME" && !draft.deliveryAddress) {
    missing.push("deliveryAddress");
  }

  return missing;
}
