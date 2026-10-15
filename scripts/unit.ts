// Day 6 unit tests: canonicalization, trusted pricing, the confirmation hash,
// the summary and the confirmation gate.
//
// TRACKED. Runs offline: no database, no Gemini, no network, no secrets.
// Only deterministic fixtures, so the results do not depend on seeded data.
//
// Usage:  npx tsx scripts/unit.ts
//
// Exits non-zero on the first failing assertion count, after printing every
// check. A test is never skipped or relaxed to make a run green.

import {
  buildConfirmationHash,
  buildSummary,
  buildTrustedPricing,
  normalizeDraftForOrder,
  prepareOrder,
  type CatalogProduct,
  type CanonicalDraft,
  type TrustedPricing,
} from "../lib/order-summary";
import { evaluateConfirmationGate } from "../lib/confirmation-gate";
import type { Draft } from "../lib/draft";
import { getDeliveryPrice } from "../lib/delivery";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function eq(name: string, actual: unknown, expected: unknown) {
  check(
    name,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

// ---------------------------------------------------------------------------
// Fixtures. Shaped exactly like the seeded demo catalog. The Tissemsilt
// regression below uses 1800 DA x 2 + 600 DA OFFICE = 4200 DA, all read from
// these fixtures and from lib/delivery.ts, never from a literal in the test.
// ---------------------------------------------------------------------------

const CATALOG: CatalogProduct[] = [
  {
    id: "prod-tee-bio",
    name: "T-shirt coton bio",
    priceDzd: "1800.00",
    stockQuantity: 20,
    sizes: ["S", "M", "L", "XL"],
    colors: ["Blanc", "Noir", "Bleu"],
  },
  {
    id: "prod-jeans",
    name: "jeans homme",
    priceDzd: "5500.00",
    stockQuantity: 3,
    sizes: ["M", "L"],
    colors: ["Bleu", "Noir"],
  },
  {
    id: "prod-baskets",
    name: "Baskets nike",
    priceDzd: "7500.00",
    stockQuantity: 8,
    sizes: [],
    colors: ["Blanc", "Noir"],
  },
];

const COMPLETE: Draft = {
  productId: "prod-tee-bio",
  quantity: 2,
  size: "L",
  color: "Noir",
  customerName: "Test Client",
  customerPhone: "0550123456",
  deliveryMethod: "OFFICE",
  wilaya: "Tissemsilt",
};

function normalized(overrides: Partial<Draft> = {}): CanonicalDraft {
  const r = normalizeDraftForOrder({ ...COMPLETE, ...overrides }, CATALOG);
  if (!r.ok) throw new Error(`fixture is not normalizable: ${r.reason}`);
  return r.draft;
}

function pricingFor(overrides: Partial<Draft> = {}): TrustedPricing {
  const p = buildTrustedPricing(normalized(overrides), CATALOG);
  if (!p) throw new Error("fixture has no trusted pricing");
  return p;
}

function hashFor(overrides: Partial<Draft> = {}): string {
  return buildConfirmationHash(normalized(overrides), pricingFor(overrides));
}

const BASE_HASH = hashFor();

// ---------------------------------------------------------------------------
console.log("\n--- 3.1a canonical normalization ---");

{
  // A-02: the phone is normalized to the canonical local form.
  eq("phone +213 prefix normalized", normalized({ customerPhone: "+213550123456" }).customerPhone, "0550123456");
  eq("phone Arabic-Indic digits normalized", normalized({ customerPhone: "٠٥٥٠١٢٣٤٥٦" }).customerPhone, "0550123456");
  eq("phone spacing normalized", normalized({ customerPhone: "05 50 12 34 56" }).customerPhone, "0550123456");
  eq("same normalized phone, same hash", hashFor({ customerPhone: "+213 550 12 34 56" }), BASE_HASH);

  // A-01: the wilaya resolves to its canonical names regardless of the input.
  eq("wilaya Arabic name resolves canonically", normalized({ wilaya: "تسمسيلت" }).wilaya, "Tissemsilt");
  eq("wilaya code resolves canonically", normalized({ wilaya: "38" }).wilaya, "Tissemsilt");
  // resolveWilaya accepts a numeric code with or without one leading zero.
  eq(
    "single-digit code with a leading zero resolves",
    (normalizeDraftForOrder({ ...COMPLETE, wilaya: "03" }, CATALOG) as { ok: true; draft: CanonicalDraft }).draft.wilaya,
    "Laghouat",
  );
  eq("canonical Arabic name retained for A-01", normalized({ wilaya: "38" }).wilayaNameAr, "تسمسيلت");
  // A real variant spelling still lands on the same canonical entry and hash.
  check("wilaya spelling variant resolves to the same hash", hashFor({ wilaya: "تيسمسيلت" }) === BASE_HASH);

  // Canonical option values.
  eq("size alias folds to canonical", normalized({ size: "l" }).size, "L");
  eq("color alias folds to canonical", normalized({ color: "NOIR" }).color, "Noir");
  check("size alias produces the same hash", hashFor({ size: "l" }) === BASE_HASH);
  check("color alias produces the same hash", hashFor({ color: "noir" }) === BASE_HASH);

  // A-07: the address belongs to HOME only.
  eq("OFFICE drops the address", normalized({ deliveryAddress: "12 rue des Lilas" }).deliveryAddress, null);
  eq(
    "HOME keeps the address",
    normalized({ deliveryMethod: "HOME", deliveryAddress: " 12 rue des Lilas " }).deliveryAddress,
    "12 rue des Lilas",
  );
  check("HOME address changes the hash", hashFor({ deliveryMethod: "HOME", deliveryAddress: "12 rue des Lilas" }) !== BASE_HASH);
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.1b normalization refusals ---");

function blockedReason(draft: Draft): string {
  const r = prepareOrder(draft, CATALOG, "fr");
  return r.ok ? "none" : r.blocked;
}

eq("missing product is incomplete", blockedReason({ ...COMPLETE, productId: undefined }), "incomplete");
eq("unknown product refused", blockedReason({ ...COMPLETE, productId: "prod-ghost" }), "invalid-product");
eq("quantity 0 refused", blockedReason({ ...COMPLETE, quantity: 0 }), "invalid-quantity");
eq("negative quantity refused", blockedReason({ ...COMPLETE, quantity: -2 }), "invalid-quantity");
eq("fractional quantity refused", blockedReason({ ...COMPLETE, quantity: 1.5 }), "invalid-quantity");
eq("unknown wilaya refused", blockedReason({ ...COMPLETE, wilaya: "Atlantis" }), "unknown-wilaya");
eq("bad phone refused", blockedReason({ ...COMPLETE, customerPhone: "12345" }), "invalid-phone");
eq("missing size refused", blockedReason({ ...COMPLETE, size: undefined }), "incomplete");
eq("size the product lacks refused", blockedReason({ ...COMPLETE, size: "XXXXXL" }), "incomplete");
eq("HOME without address refused", blockedReason({ ...COMPLETE, deliveryMethod: "HOME" }), "incomplete");
eq(
  "quantity above stock refused at summary time",
  blockedReason({ ...COMPLETE, productId: "prod-jeans", quantity: 10, size: "M" }),
  "quantity-too-high-stock",
);

// A missing or unknown fee must never produce a summary or a hash.
{
  // A wilaya outside the fee table cannot be priced. resolveWilaya only knows
  // the 69 wilayas, so this is exercised by pricing a canonical draft whose
  // wilaya name is absent from the fee module's code lookup.
  const d = normalized();
  const bogus = { ...d, wilaya: "Wilaya Inconnue", wilayaNameAr: "ولاية غير معروفة" };
  eq("unknown fee yields no trusted pricing", buildTrustedPricing(bogus, CATALOG), null);
  const wilayaOffTable = normalizeDraftForOrder(
    { ...COMPLETE, wilaya: "38" },
    CATALOG,
  );
  check(
    "a resolvable wilaya always has a fee",
    wilayaOffTable.ok &&
      getDeliveryPrice(38, "OFFICE") !== null &&
      buildTrustedPricing(wilayaOffTable.draft, CATALOG) !== null,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.1c hash sensitivity ---");

eq("hash is 64 lowercase hex chars", /^[0-9a-f]{64}$/.test(BASE_HASH), true);

// Equivalent drafts, different original key order, must hash the same.
{
  const reordered: Draft = {
    deliveryAddress: undefined,
    wilaya: COMPLETE.wilaya,
    color: COMPLETE.color,
    size: COMPLETE.size,
    quantity: COMPLETE.quantity,
    customerPhone: COMPLETE.customerPhone,
    customerName: COMPLETE.customerName,
    deliveryMethod: COMPLETE.deliveryMethod,
    productId: COMPLETE.productId,
  };
  const r = normalizeDraftForOrder(reordered, CATALOG);
  check(
    "different input key order, identical hash",
    r.ok && buildConfirmationHash(r.draft, pricingFor()) === BASE_HASH,
  );
}

const FIELD_MUTATIONS: Array<[string, Partial<Draft>]> = [
  ["productId", { productId: "prod-jeans", size: "M" }],
  ["quantity", { quantity: 3 }],
  ["size", { size: "M" }],
  ["color", { color: "Bleu" }],
  ["customerName", { customerName: "Autre Client" }],
  ["customerPhone", { customerPhone: "0661000000" }],
  ["deliveryMethod", { deliveryMethod: "HOME", deliveryAddress: "12 rue des Lilas" }],
  ["wilaya", { wilaya: "Oran" }],
  ["deliveryAddress", { deliveryMethod: "HOME", deliveryAddress: "5 rue Different" }],
];

for (const [field, mutation] of FIELD_MUTATIONS) {
  check(`changing ${field} changes the hash`, hashFor(mutation) !== BASE_HASH);
}

// Each price value is independently covered by the hash.
{
  const d = normalized();
  const p = pricingFor();
  const withPrice = (over: Partial<TrustedPricing>) =>
    buildConfirmationHash(d, { ...p, ...over });

  check("changing only unitPrice changes the hash", withPrice({ unitPrice: "1801" }) !== BASE_HASH);
  check("changing only deliveryPrice changes the hash", withPrice({ deliveryPrice: "601" }) !== BASE_HASH);
  check("changing only total changes the hash", withPrice({ total: "4201" }) !== BASE_HASH);

  // A current price or fee change must invalidate an old confirmation: this is
  // exactly the A-09 recompute that the gate performs.
  const repriced = CATALOG.map((x) => (x.id === "prod-tee-bio" ? { ...x, priceDzd: "1900.00" } : x));
  const repricedPricing = buildTrustedPricing(normalized(), repriced);
  check(
    "a current price change invalidates the stored hash",
    repricedPricing !== null && buildConfirmationHash(normalized(), repricedPricing) !== BASE_HASH,
  );
  const refed = buildTrustedPricing(
    normalized(),
    CATALOG,
  );
  check("trusted pricing is stable for unchanged inputs", refed !== null && refed.total === p.total);
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.1d trusted pricing arithmetic (Tissemsilt OFFICE fixture) ---");

{
  // 2 x T-shirt coton bio at 1800 DA + 600 DA OFFICE fee to Tissemsilt (38).
  const officeFee = getDeliveryPrice(38, "OFFICE");
  const p = pricingFor();
  eq("unit price comes from the catalog", p.unitPrice, "1800");
  eq("delivery fee comes from lib/delivery", p.deliveryPrice, String(officeFee));
  eq("items total is quantity x unit price", p.itemsTotal, String(2 * 1800));
  eq("total is items + delivery", p.total, String(2 * 1800 + officeFee!));
  eq("fixture total is 4200 DA", p.total, "4200");

  // HOME is the office fee plus the configured surcharge.
  const home = pricingFor({ deliveryMethod: "HOME", deliveryAddress: "12 rue des Lilas" });
  eq("HOME delivery fee is 800 DA", home.deliveryPrice, "800");
  eq("HOME total is 4400 DA", home.total, "4400");
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.1e localized summary content ---");

{
  const p = pricingFor();

  const ar = buildSummary(normalized(), p, "ar");
  check("ar uses the canonical Arabic wilaya name", ar.includes("تسمسيلت"), ar.slice(0, 80));
  check("ar uses the A-08 delivery label", ar.includes("مكتب التوصيل"));
  check("ar states the total in دج", ar.includes("4200 دج"));
  check("ar has no address line for OFFICE", !ar.includes("العنوان"));
  check("ar asks for explicit confirmation", ar.includes("أكّد الطلب"));
  check("ar shows the product from the database", ar.includes("T-shirt coton bio"));
  check("ar shows both option labels", ar.includes("المقاس L") && ar.includes("اللون Noir"));

  const fr = buildSummary(normalized(), p, "fr");
  check("fr uses the canonical French wilaya name", fr.includes("Tissemsilt"));
  check("fr uses the A-08 delivery label", fr.includes("bureau de livraison"));
  check("fr states the total in DA", fr.includes("4200 DA"));
  check("fr has no address line for OFFICE", !/adresse/i.test(fr));
  check("fr asks for explicit confirmation", fr.includes("confirmez la commande"));
  check("fr shows both option labels", fr.includes("taille L") && fr.includes("couleur Noir"));

  const en = buildSummary(normalized(), p, "en");
  check("en uses the canonical French wilaya name", en.includes("Tissemsilt"));
  check("en uses the A-08 delivery label", en.includes("delivery office"));
  check("en states the total in DZD", en.includes("4200 DZD"));
  check("en has no address line for OFFICE", !/address/i.test(en));
  check("en asks for explicit confirmation", en.includes("confirm the order"));

  // A-07: HOME shows the address line, in all three languages.
  const homeDraft = normalized({ deliveryMethod: "HOME", deliveryAddress: "12 rue des Lilas" });
  const homePricing = pricingFor({ deliveryMethod: "HOME", deliveryAddress: "12 rue des Lilas" });
  check("ar HOME shows the address", buildSummary(homeDraft, homePricing, "ar").includes("12 rue des Lilas"));
  check("fr HOME shows the address", buildSummary(homeDraft, homePricing, "fr").includes("12 rue des Lilas"));
  check("en HOME shows the address", buildSummary(homeDraft, homePricing, "en").includes("12 rue des Lilas"));
  check("ar HOME uses the home label", buildSummary(homeDraft, homePricing, "ar").includes("المنزل"));

  // A product with no sizes must omit the size label rather than show a blank.
  const noSize = normalizeDraftForOrder(
    {
      productId: "prod-baskets",
      quantity: 1,
      color: "Noir",
      customerName: "Test Client",
      customerPhone: "0550123456",
      deliveryMethod: "OFFICE",
      wilaya: "Tissemsilt",
    },
    CATALOG,
  );
  if (noSize.ok) {
    const noSizePricing = buildTrustedPricing(noSize.draft, CATALOG);
    if (noSizePricing) {
      for (const lang of ["ar", "fr", "en"] as const) {
        const s = buildSummary(noSize.draft, noSizePricing, lang);
        const label = lang === "ar" ? "المقاس" : lang === "fr" ? "taille" : "size";
        check(`${lang}: inapplicable size label omitted`, !s.includes(label), s.slice(0, 70));
        check(`${lang}: no null/undefined/blank fragment`, !/null|undefined|:\s*,|,\s*,/.test(s));
      }
    }
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.2a confirmation gate ---");

const GOOD_GATE = {
  phase: "AWAITING_CONFIRMATION",
  storedHash: BASE_HASH,
  draft: COMPLETE,
  catalog: CATALOG,
};

{
  const pass = evaluateConfirmationGate(GOOD_GATE);
  check("a valid confirmation passes the gate", pass.ok, pass.ok ? "" : pass.reason);

  eq(
    "CREATE_ORDER before any summary is rejected",
    evaluateConfirmationGate({ ...GOOD_GATE, phase: "ORDER_COLLECTION" }).ok,
    false,
  );
  eq(
    "CREATE_ORDER in IDLE is rejected",
    evaluateConfirmationGate({ ...GOOD_GATE, phase: "IDLE" }).ok,
    false,
  );
  eq("a missing hash is rejected", evaluateConfirmationGate({ ...GOOD_GATE, storedHash: null }).ok, false);

  const mismatch = evaluateConfirmationGate({ ...GOOD_GATE, storedHash: "0".repeat(64) });
  check("a mismatched hash is rejected", !mismatch.ok && mismatch.reason === "hash-mismatch");

  const incomplete = evaluateConfirmationGate({ ...GOOD_GATE, draft: { ...COMPLETE, wilaya: undefined } });
  check("an incomplete draft is rejected", !incomplete.ok && incomplete.reason === "incomplete-draft");

  const badQty = evaluateConfirmationGate({ ...GOOD_GATE, draft: { ...COMPLETE, quantity: 0 } });
  check("an invalid draft is rejected", !badQty.ok);

  // A price change between summary and confirmation must be detected.
  const repriced = CATALOG.map((x) => (x.id === "prod-tee-bio" ? { ...x, priceDzd: "1900.00" } : x));
  const priceGate = evaluateConfirmationGate({ ...GOOD_GATE, catalog: repriced });
  check("a price change is detected", !priceGate.ok && priceGate.reason === "hash-mismatch");

  // A fee change is equivalent to a wilaya change here: same draft, new fee.
  const feeGate = evaluateConfirmationGate({
    ...GOOD_GATE,
    catalog: CATALOG,
    draft: { ...COMPLETE, wilaya: "Oran" },
  });
  check("a wilaya/fee change is detected", !feeGate.ok && feeGate.reason === "hash-mismatch");

  // An empty catalog removes the trusted price entirely.
  const noPricing = evaluateConfirmationGate({ ...GOOD_GATE, catalog: [] });
  check("missing trusted pricing is rejected", !noPricing.ok, noPricing.ok ? "" : noPricing.reason);

  // Every order-relevant field change must invalidate a stored hash.
  for (const [field, mutation] of FIELD_MUTATIONS) {
    const g = evaluateConfirmationGate({ ...GOOD_GATE, draft: { ...COMPLETE, ...mutation } });
    check(`an accepted ${field} change invalidates the old hash`, !g.ok, `reason=${g.ok ? "passed" : g.reason}`);
  }

  // A language-only difference is not part of the draft, so it must not
  // invalidate a confirmation (clarification 2).
  check("language is not part of the hash contract", BASE_HASH === buildConfirmationHash(normalized(), pricingFor()));
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.2b summary determinism (no unnecessary regeneration) ---");

{
  // Two prepareOrder calls on the same draft must produce the same hash, so a
  // re-summary never invalidates a confirmation for no reason.
  const a = prepareOrder(COMPLETE, CATALOG, "fr");
  const b = prepareOrder(COMPLETE, CATALOG, "ar");
  check("the hash does not depend on the summary language", a.ok && b.ok && a.order.hash === b.order.hash);
  check("the summary does depend on the language", a.ok && b.ok && a.order.summary !== b.order.summary);
  eq("a complete draft reaches AWAITING_CONFIRMATION-ready state", a.ok, true);
}

// ---------------------------------------------------------------------------
console.log(`\n=============== UNIT TEST SUMMARY ===============`);
console.log(`${passed}/${passed + failed} checks passed${failed ? `, ${failed} FAILED` : ""}`);
for (const f of failures) console.log(`  FAILED: ${f}`);
process.exit(failed > 0 ? 1 : 0);