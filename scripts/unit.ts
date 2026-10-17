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
import { SEED_STOCK_BY_NAME } from "../lib/seed-data";
import {
  authConfigured,
  clearedCookieOptions,
  NO_STORE_HEADERS,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
  signSession,
  verifyPasscode,
  verifySession,
} from "../lib/auth";
import { normalizeWilayaText, resolveWilaya, WILAYAS } from "../lib/wilayas";
import {
  dominantScriptIsArabic,
  explicitLanguageRequest,
  replyInLabel,
  replyInstruction,
  resolveReplyLanguage,
  storedLanguage,
} from "../lib/language";
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

/** Structural comparison, for the cases that return plain objects. */
function deepEq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  check(name, a === b, `expected ${b}, got ${a}`);
}

// ---------------------------------------------------------------------------
// Fixtures. Shaped exactly like the seeded demo catalog. The Tissemsilt
// regression below uses 1800 DA x 2 + 600 DA OFFICE = 4200 DA, all read from
// these fixtures and from lib/delivery.ts, never from a literal in the test.
//
// Prices, names, sizes and colours are spelled out so the fixture stays a
// self-contained object graph. Stock is NOT spelled out: it is read from
// lib/seed-data.ts, the same module the seed, the stock restore helper and the
// Day 11 reset use, so an A-15 stock change cannot desynchronise these tests.
// ---------------------------------------------------------------------------

function seedStockOr(name: string, fallback: number): number {
  return SEED_STOCK_BY_NAME[name] ?? fallback;
}

const CATALOG: CatalogProduct[] = [
  {
    id: "prod-tee-bio",
    name: "T-shirt coton bio",
    priceDzd: "1800.00",
    stockQuantity: seedStockOr("T-shirt coton bio", 40),
    sizes: ["S", "M", "L", "XL"],
    colors: ["Blanc", "Noir", "Bleu"],
  },
  {
    id: "prod-jeans",
    name: "jeans homme",
    priceDzd: "5500.00",
    stockQuantity: seedStockOr("jeans homme", 6),
    sizes: ["M", "L"],
    colors: ["Bleu", "Noir"],
  },
  {
    id: "prod-baskets",
    name: "Baskets nike",
    priceDzd: "7500.00",
    stockQuantity: seedStockOr("Baskets nike", 30),
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
// ---------------------------------------------------------------------------
console.log("\n--- 3.3 reply language rules (Day 8) ---");
// The Day 8 bug: the backend derived the language from SCRIPT only, so Latin
// script always became "fr" and an English customer could never be answered in
// English. The model now decides between en and fr for Latin script.

{
  // Spec 8.2: Arabic script -> ar, whatever the model says.
  eq(
    "Arabic script forces ar over a model label of fr",
    resolveReplyLanguage({ modelLanguage: "fr", latest: "أريد تيشيرت" }),
    "ar",
  );
  eq(
    "Arabic script forces ar over a model label of en",
    resolveReplyLanguage({ modelLanguage: "en", latest: "بكم الثمن؟" }),
    "ar",
  );

  // The regression that mattered: English must win for English input.
  eq(
    "English input answered in English when the model says en",
    resolveReplyLanguage({ modelLanguage: "en", latest: "I want 2 white sneakers size 42" }),
    "en",
  );
  eq(
    "English input answered in English (second phrasing)",
    resolveReplyLanguage({ modelLanguage: "en", latest: "price of the jeans?" }),
    "en",
  );
  eq(
    "French input stays French",
    resolveReplyLanguage({ modelLanguage: "fr", latest: "Je veux le t-shirt" }),
    "fr",
  );
  eq(
    "Latin-script Darija stays French",
    resolveReplyLanguage({ modelLanguage: "fr", latest: "chkoun l3ayn dyal tshirt?" }),
    "fr",
  );

  // A model that returns 'ar' for Latin script must NOT be trusted.
  eq(
    "model 'ar' is rejected for Latin script and falls back to the conversation",
    resolveReplyLanguage({ modelLanguage: "ar", latest: "I want a t-shirt" }),
    "fr",
  );
  eq(
    "an unusable model label falls back to the conversation language",
    resolveReplyLanguage({ modelLanguage: "zz", latest: "I want a t-shirt", conversationLanguage: "en" }),
    "en",
  );
  eq(
    "an unusable model label with no history falls back to fr",
    resolveReplyLanguage({ modelLanguage: undefined, latest: "???" }),
    "fr",
  );

  // Explicit requests win over the model.
  eq(
    "'answer me in English' wins over a model label of fr",
    resolveReplyLanguage({ modelLanguage: "fr", latest: "actually answer me in English" }),
    "en",
  );
  eq(
    "'parlez en arabe' wins over a model label of en",
    resolveReplyLanguage({ modelLanguage: "en", latest: "parlez en arabe" }),
    "ar",
  );
  eq(
    "an Arabic-script request to speak Arabic is detected",
    explicitLanguageRequest("تكلم معي بالعربية"),
    "ar",
  );
  eq(
    "a normal Darija sentence is not a language request",
    explicitLanguageRequest("أريد تيشيرت قطن بيول"),
    undefined,
  );
  eq(
    "a product name is not a language request",
    explicitLanguageRequest("I want the T-shirt enfant"),
    undefined,
  );

  // An explicitly requested language survives a terse follow-up.
  eq(
    "an explicit English switch survives a terse follow-up",
    resolveReplyLanguage({
      modelLanguage: "fr",
      latest: "change the quantity to 1",
      conversationLanguage: "en",
      conversationLanguageExplicit: true,
    }),
    "en",
  );
  eq(
    "without the explicit flag the model wins on a terse follow-up",
    resolveReplyLanguage({
      modelLanguage: "fr",
      latest: "change the quantity to 1",
      conversationLanguage: "en",
      conversationLanguageExplicit: false,
    }),
    "fr",
  );

  // The prompt instruction must differ by script, and must never pin Latin
  // script to a single language.
  check(
    "Arabic script pins the instruction to Arabic",
    /set "language" to "ar"/i.test(replyInstruction("أريد تيشيرت")),
  );
  const latin = replyInstruction("I want a t-shirt");
  check("Latin script asks the model to mirror the customer", latin.includes("SAME language"));
  check("Latin script offers English", latin.includes('"en"'));
  check("Latin script offers French for Darija", latin.includes('"fr"'));
  check("Latin script never pins to French", !/answer in French\.$/.test(latin.trim()));

  eq("replyIn label is ar for Arabic script", replyInLabel("أريد تيشيرت"), "ar");
  eq("replyIn label is model for Latin script", replyInLabel("I want a t-shirt"), "model");

  // storedLanguage round-trips through rawAiOutput.
  deepEq(
    "stored language round-trips",
    storedLanguage({ resolvedLanguage: "en", languageExplicit: true }),
    { language: "en", explicit: true },
  );
  deepEq(
    "a row with no resolved language is not explicit",
    storedLanguage({ parsed: {} }),
    { explicit: false },
  );
  deepEq("a non-object row is handled", storedLanguage(null), { explicit: false });

  // Dominant script, the rule Arabic decisions rest on.
  eq("Arabic script detected", dominantScriptIsArabic("أريد تيشيرت"), true);
  eq("Latin script not Arabic", dominantScriptIsArabic("I want a t-shirt"), false);
  eq("digits only are not Arabic", dominantScriptIsArabic("0550123456"), false);
  // A mostly-Latin message with one Arabic word must stay Latin.
  eq("one Arabic word does not flip a Latin message", dominantScriptIsArabic("I want tishirt تيشيرت"), false);

  // Arabic-Indic DIGITS are language-neutral and must not force Arabic.
  eq("Arabic-Indic digits do not force Arabic", dominantScriptIsArabic("phone ٠٥٥٠١٢٣٤٥٦"), false);
  eq("Arabic-Indic digits in a French sentence stay Latin", dominantScriptIsArabic("mon numéro est ٠٥٥٠١٢٣٤٥٦"), false);
  eq("Extended Arabic-Indic digits do not force Arabic", dominantScriptIsArabic("phone ۰۵۵۰۱۲۳۴۵۶"), false);
  // ...but real Arabic text with digits still counts as Arabic.
  eq("Arabic text with Arabic-Indic digits is Arabic", dominantScriptIsArabic("رقمي ٠٥٥٠١٢٣٤٥٦"), true);
  // The reply language follows the script, so the digits case must stay en/fr.
  eq(
    "English sentence with Arabic-Indic digits is answered in English",
    resolveReplyLanguage({ modelLanguage: "en", latest: "phone ٠٥٥٠١٢٣٤٥٦" }),
    "en",
  );
  eq(
    "French sentence with Arabic-Indic digits is answered in French",
    resolveReplyLanguage({ modelLanguage: "fr", latest: "mon numéro ٠٥٥٠١٢٣٤٥٦" }),
    "fr",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.4 wilaya name resolution (Day 8 article fix) ---");
{
  // The canonical Arabic names do not agree on the definite article, so both
  // spellings have to resolve to the same wilaya.
  eq("جلفة (no article) resolves", resolveWilaya("جلفة")?.code, 17);
  eq("الجلفة (with article) resolves", resolveWilaya("الجلفة")?.code, 17);
  eq("المسعد (article form of a bare name) resolves", resolveWilaya("المسعد")?.code, 66);
  eq("مسعد (bare form) resolves", resolveWilaya("مسعد")?.code, 66);
  eq(
    "both spellings give the same canonical name",
    resolveWilaya("جلفة")?.nameFr,
    resolveWilaya("الجلفة")?.nameFr,
  );

  // Every canonical name must still resolve to itself, and the article-stripped
  // keys must stay unique so no input can match two wilayas.
  let tested = 0;
  let failures = 0;
  const strippedKeys = new Map<string, Set<number>>();
  for (const w of WILAYAS) {
    for (const input of [w.nameFr, w.nameAr, String(w.code), String(w.code).padStart(2, "0")]) {
      tested += 1;
      const r = resolveWilaya(input);
      if (!r || r.code !== w.code) failures += 1;
    }
    for (const name of [w.nameFr, w.nameAr]) {
      const key = normalizeWilayaText(name).replace(/^ال/, "").replace(/[اويىه]/g, "").replace(/\s+/g, "");
      if (!strippedKeys.has(key)) strippedKeys.set(key, new Set());
      strippedKeys.get(key)!.add(w.code);
    }
  }
  eq("all canonical name/code inputs resolve", failures, 0);
  check("all 276 inputs were tested", tested === WILAYAS.length * 4, `tested=${tested}`);
  const ambiguous = [...strippedKeys.entries()].filter(([, codes]) => codes.size > 1);
  eq("no article-stripped key matches two wilayas", ambiguous.length, 0);
  eq(
    "article-stripped keys stay distinct",
    strippedKeys.size,
    WILAYAS.length * 2,
  );

  // A genuinely unknown name is still refused.
  eq("an invented wilaya is still refused", resolveWilaya("Atlantis"), null);
  eq("nonsense Arabic is still refused", resolveWilaya("ولاية غير موجودة"), null);
}

// ---------------------------------------------------------------------------
console.log("\n--- 3.5 dashboard auth (Day 9) ---");
// lib/auth reads process.env at call time, so these tests set it directly.
// The values below are THROWAWAY fixtures defined here in the test file. They
// are not the real passcode or secret and are never written anywhere.
{
  const REAL = {
    DASHBOARD_PASSCODE: process.env.DASHBOARD_PASSCODE,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  const PASSCODE = "throwaway-test-passcode-000";
  const SECRET = "throwaway-test-session-secret-0000000000000000000000";
  const setEnv = (p?: string, s?: string) => {
    if (p === undefined) delete process.env.DASHBOARD_PASSCODE;
    else process.env.DASHBOARD_PASSCODE = p;
    if (s === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = s;
  };
  const NOW = 1_800_000_000_000; // fixed instant, so nothing depends on the clock
  const HOUR = 60 * 60 * 1000;

  // --- fail closed -----------------------------------------------------
  setEnv(undefined, SECRET);
  eq("missing passcode denies", verifyPasscode(PASSCODE), false);
  eq("missing passcode issues no token", signSession(NOW), null);
  setEnv(PASSCODE, undefined);
  eq("missing secret denies", verifyPasscode(PASSCODE), false);
  eq("missing secret issues no token", signSession(NOW), null);

  setEnv("short", SECRET);
  eq("passcode under 12 chars is refused", verifyPasscode("short"), false);
  eq("short passcode issues no token", signSession(NOW), null);
  eq("authConfigured is false for a short passcode", authConfigured(), false);

  setEnv(PASSCODE, "tooshortsecret");
  eq("secret under 32 chars is refused", verifyPasscode(PASSCODE), false);
  setEnv(PASSCODE, SECRET);
  eq("authConfigured is true for a valid setup", authConfigured(), true);

  // --- passcode comparison --------------------------------------------
  eq("correct passcode accepted", verifyPasscode(PASSCODE), true);
  eq("wrong passcode rejected", verifyPasscode("wrong-passcode-123"), false);
  eq("passcode is case sensitive", verifyPasscode(PASSCODE.toUpperCase()), false);
  eq("empty passcode rejected", verifyPasscode(""), false);
  eq(
    "a passcode of a different length is rejected",
    verifyPasscode(PASSCODE + "x"),
    false,
  );

  // --- token sign / verify -------------------------------------------
  const token = signSession(NOW)!;
  check("a token is produced", typeof token === "string" && token.length > 0);
  eq("a valid token verifies", verifySession(token, NOW), true);
  check(
    "the token does not contain the passcode",
    !token.includes(PASSCODE) && !token.includes("passcode"),
    token.slice(0, 24),
  );
  eq("the token has three parts", token.split(".").length, 3);

  // --- expiry ----------------------------------------------------------
  eq("a token is still valid just before expiry", verifySession(token, NOW + SESSION_MAX_AGE_SECONDS * 1000 - 1000), true);
  eq("a token is rejected at expiry", verifySession(token, NOW + SESSION_MAX_AGE_SECONDS * 1000 + 1), false);
  // The token lives 12 hours, so 13 hours must be refused.
  eq("a long-expired token is rejected", verifySession(token, NOW + 13 * HOUR), false);
  eq("a token is accepted at 11 hours", verifySession(token, NOW + 11 * HOUR), true);

  // --- tampering -------------------------------------------------------
  eq("a tampered payload is rejected", verifySession(token.replace(/\.\d+\./, ".1."), NOW), false);
  eq("a tampered signature is rejected", verifySession(`${token.slice(0, -1)}0`, NOW), false);
  eq("an empty token is rejected", verifySession("", NOW), false);
  eq("a null token is rejected", verifySession(null, NOW), false);
  eq("an undefined token is rejected", verifySession(undefined, NOW), false);
  eq("a token with too few parts is rejected", verifySession("v1.123", NOW), false);
  eq("an unknown version is rejected", verifySession(token.replace(/^v1\./, "v2."), NOW), false);
  eq("a garbage token is rejected", verifySession("not-a-token", NOW), false);

  // --- a token signed with a different secret --------------------------
  const otherToken = (() => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "a-completely-different-secret-0000000000000000000";
    const t = signSession(NOW)!;
    process.env.SESSION_SECRET = saved;
    return t;
  })();
  eq("a token signed with a different secret is rejected", verifySession(otherToken, NOW), false);

  // --- cookie options --------------------------------------------------
  const opts = sessionCookieOptions();
  eq("cookie is HttpOnly", opts.httpOnly, true);
  eq("cookie is SameSite=Lax", opts.sameSite, "lax");
  eq("cookie is scoped to /", opts.path, "/");
  eq("cookie max age is 12 hours", opts.maxAge, 60 * 60 * 12);
  eq("cleared cookie expires immediately", clearedCookieOptions().maxAge, 0);
  eq(
    "cookie is Secure in production",
    (() => {
      const saved = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = "production";
      const secure = sessionCookieOptions().secure;
      (process.env as Record<string, string | undefined>).NODE_ENV = saved;
      return secure;
    })(),
    true,
  );
  eq(
    "cookie is not Secure outside production",
    (() => {
      const saved = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV = "development";
      const secure = sessionCookieOptions().secure;
      (process.env as Record<string, string | undefined>).NODE_ENV = saved;
      return secure;
    })(),
    false,
  );

  // --- no-store on every private response -------------------------------
  check(
    "private responses are no-store",
    NO_STORE_HEADERS["Cache-Control"].includes("no-store"),
    NO_STORE_HEADERS["Cache-Control"],
  );

  // restore whatever the real environment had
  if (REAL.DASHBOARD_PASSCODE === undefined) delete process.env.DASHBOARD_PASSCODE;
  else process.env.DASHBOARD_PASSCODE = REAL.DASHBOARD_PASSCODE;
  if (REAL.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = REAL.SESSION_SECRET;
}

console.log(`\n=============== UNIT TEST SUMMARY ===============`);
console.log(`${passed}/${passed + failed} checks passed${failed ? `, ${failed} FAILED` : ""}`);
for (const f of failures) console.log(`  FAILED: ${f}`);
process.exit(failed > 0 ? 1 : 0);