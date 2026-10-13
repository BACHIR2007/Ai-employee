// Delivery fee configuration.
//
// Spec section 6: delivery fees are a server-side code configuration module,
// NOT a database table. The AI may not choose or override the fee; the
// backend selects it.
//
// DEMO VALUES. The prices below are invented for this demo and are not real
// courier tariffs. Every value is written out explicitly rather than computed
// at runtime, because the delivery fee is part of the canonical draft that the
// confirmation hash covers (addendum A-09). If the fee could vary run to run,
// the same draft would hash differently and a valid confirmation would break.

export type DeliveryMethod = "HOME" | "OFFICE";

/** Office-pickup fee in DZD, per wilaya code. Values are 400, 500 or 600. */
export const OFFICE_DELIVERY_FEE_DA: Record<number, number> = {
  1: 500,
  2: 600,
  3: 400,
  4: 500,
  5: 600,
  6: 400,
  7: 500,
  8: 600,
  9: 400,
  10: 500,
  11: 600,
  12: 400,
  13: 500,
  14: 600,
  15: 400,
  16: 500,
  17: 600,
  18: 400,
  19: 500,
  20: 600,
  21: 400,
  22: 500,
  23: 600,
  24: 400,
  25: 500,
  26: 600,
  27: 400,
  28: 500,
  29: 600,
  30: 400,
  31: 500,
  32: 600,
  33: 400,
  34: 500,
  35: 600,
  36: 400,
  37: 500,
  38: 600,
  39: 400,
  40: 500,
  41: 600,
  42: 400,
  43: 500,
  44: 600,
  45: 400,
  46: 500,
  47: 600,
  48: 400,
  49: 500,
  50: 600,
  51: 400,
  52: 500,
  53: 600,
  54: 400,
  55: 500,
  56: 600,
  57: 400,
  58: 500,
  59: 600,
  60: 400,
  61: 500,
  62: 600,
  63: 400,
  64: 500,
  65: 600,
  66: 400,
  67: 500,
  68: 600,
  69: 400,
};

/** Home delivery costs this much more than office pickup. Demo value. */
export const HOME_DELIVERY_SURCHARGE_DA = 200;

/**
 * Returns the configured delivery price in DZD for a wilaya and method, or
 * null when the wilaya code is not on the allowlist.
 */
export function getDeliveryPrice(
  wilayaCode: number,
  deliveryMethod: DeliveryMethod,
): number | null {
  const officeFee = OFFICE_DELIVERY_FEE_DA[wilayaCode];
  if (officeFee === undefined) return null;

  return deliveryMethod === "HOME"
    ? officeFee + HOME_DELIVERY_SURCHARGE_DA
    : officeFee;
}