# AI Employee — MVP Specification: Addendum v1.1

**Status:** Normative. Claude's final technical review of MVP Specification v1.0 is complete. **v1.1 = MVP Specification v1.0 + this addendum.** Amended on October 20, 2026 by **A-14** (public demo access without a passcode) and on October 22, 2026 by **A-15** (reset visibility, new starting stock, per-minute cap, diagnostic logging). Both amendments are recorded below and apply from their dates.
**Precedence:** where this addendum conflicts with v1.0, **this addendum wins**. Everything in v1.0 not mentioned here is unchanged.
**Usage:** give both files to every AI coding session (`docs/MVP-Specification.md` and `docs/MVP-Addendum-v1.1.md`).
**Date:** October 12, 2026 (amended October 20 and October 22, 2026)

---

## A-01 — Wilaya data and matching (extends §6, §9.4)

- The wilaya constants module holds entries of the form `{ code, nameFr, nameAr }`.
- **Before seeding, verify the list against a current official source** (Algeria's administrative divisions have been changing). Record the source and date in a code comment.
- Implement one function `resolveWilaya(input)` returning the canonical entry or `null`. It normalizes the input and then matches against the numeric code (with or without a leading zero), the normalized `nameFr`, the normalized `nameAr`, and a small alias map for common alternative spellings.
- Normalization steps: convert Arabic-Indic digits to ASCII (see A-02); remove Arabic diacritics and tatweel; remove Latin accents; lowercase; unify Arabic letter variants (`أ إ آ` → `ا`, `ى` → `ي`, `ة` → `ه`); replace hyphens, apostrophes and underscores with a space; collapse repeated spaces; strip a leading `ولاية`, `wilaya`, `wilaya de`.
- `Order.wilaya` stores the canonical **`nameFr`**. Delivery fees are keyed by `code`.
- Display name in summaries: `nameAr` when `language = ar`, otherwise `nameFr`.
- Gemini returns the wilaya **as the customer wrote it**. The backend resolves it. Gemini never validates wilayas (unchanged).
- Add Arabic-script, French-spelling and numeric-code inputs to the Day 8 test scenarios.

## A-02 — Digit, phone and quantity normalization (extends §9.2, §9.3)

- `normalizeDigits(text)` converts Arabic-Indic digits (U+0660–U+0669) and Extended Arabic-Indic digits (U+06F0–U+06F9) to ASCII. Apply it to the phone number, quantity and any numeric wilaya code **before** validation.
- Phone normalization, in order: apply `normalizeDigits`; remove spaces, dots, dashes and parentheses; if the value starts with `+213` or `00213`, remove that prefix and make sure exactly one leading `0` remains; then validate with `^0[567][0-9]{8}$`. Store the normalized value.
- The model must send `quantity` as an **integer** (it converts number words such as "deux" or "اثنين" itself). The backend rejects non-integers.

## A-03 — Function duration and Gemini timeout (extends §8.1, §15)

- Export an explicit `maxDuration` from the `/api/chat` route handler. On Day 1 or Day 3, check Vercel's **current** limit for the project's plan and use the largest value it allows, up to 60 seconds.
- Choose the per-attempt Gemini timeout `T` so the worst case fits: `2 × T + 5 s ≤ maxDuration` (for example, `maxDuration = 60` → `T ≈ 20 s`; `maxDuration = 30` → `T ≈ 12 s`).
- Track the remaining time budget for the request. Perform the single retry only if at least one full `T` remains. Otherwise return the generic error template.

## A-04 — Changing the product during a draft (extends §7.2, §8.3)

When an accepted `UPDATE_ORDER_DRAFT` changes `productId` to a different product:

1. Keep customer fields (name, phone, delivery method, wilaya, address).
2. Revalidate `size` and `color` against the new product's options and **clear** any that are invalid or not applicable.
3. Revalidate `quantity` against the new product's stock and clear it if it exceeds stock.
4. Clear `confirmationHash` and set the phase to `ORDER_COLLECTION`.
5. If anything was cleared, **replace the model reply** with template 13.11 (see A-08).

## A-05 — Prompt rule for the missing-fields list (extends §8.1, §8.5)

Add to the system prompt, in substance:

- The missing-fields list in the context is computed **before** your own proposed update is applied.
- First extract what the latest customer message supplies. Then ask **one** question about the first required field that is still missing after accounting for what you just extracted.
- Never ask for a field that is already in the draft or in the current message.
- Send the wilaya as the customer wrote it, the phone digits as typed, and `quantity` as an integer.
- If your extraction completes the draft, reply with a short acknowledgement only; the backend replaces it with the summary.

Verify this behavior in the Day 5 and Day 8 tests.

## A-06 — Pending and failed AI rows (extends §4.1 step 5, §5.4)

- The history loader (last 12 messages) includes **customer messages and AI rows with `aiCallStatus = SUCCEEDED` and non-null content only**. It excludes `PENDING` and `FAILED` rows.
- At the start of each chat request, run one sweep: mark `PENDING` AI rows older than 60 seconds as `FAILED`. They still count toward the hourly AI-call cap.

## A-07 — Office delivery (replaces the "pickup office note" wording in §5.5, §6, §9.4, §8.5)

- For `OFFICE`, `deliveryAddress` is **not collected**, must be `null`, and the summary omits the address.
- The store settles the office details during its confirmation call.
- If the method changes from `HOME` to `OFFICE`, clear `deliveryAddress`. If it changes to `HOME`, `deliveryAddress` becomes required.

## A-08 — Template changes (extends §13)

- **Never show raw enums.** `{deliveryMethod}` uses a localized label. Suggested labels: `ar` المنزل / مكتب التوصيل; `fr` domicile / bureau de livraison; `en` home / delivery office. The sentence may be adjusted so it reads naturally.
- Add a small localized **field label dictionary** (size, color, quantity, name, phone, wilaya, address, product, delivery method) for use in templates.
- **13.4 (invalid size/color):** add an `{availableOptions}` placeholder listing the selected product's allowed sizes and colors in the conversation language. If no product is selected yet, use a generic wording without the list.
- Wilaya display follows A-01.
- **New 13.11 — Product changed** (used by A-04), with `{product}` and `{missingList}` built from the field label dictionary:
  - `ar`: تم تغيير المنتج إلى {product}. يرجى اختيار {missingList} من جديد.
  - `fr`: Le produit est maintenant {product}. Veuillez choisir à nouveau : {missingList}.
  - `en`: The product is now {product}. Please choose again: {missingList}.

## A-09 — Confirmation gate and hash (replaces §10.1 step 1; extends §7.3, §7.4)

- The hash covers the canonical JSON of **the normalized draft plus `unitPrice`, `deliveryPrice` and `total`** exactly as shown in the summary, so the confirmed numbers are the displayed numbers.
- At creation time, recompute with current database price and configured fee. If the result differs from the stored hash, do not create the order: regenerate the summary, store the new hash and send it.
- **The gate is consumed by a single conditional update as the first statement of the transaction:**
  `UPDATE "Conversation" SET phase = 'IDLE', "orderDraft" = NULL, "confirmationHash" = NULL WHERE id = :id AND phase = 'AWAITING_CONFIRMATION' AND "confirmationHash" = :storedHash`
  (in Prisma, `updateMany` and check that `count === 1`). Read the draft and compute the hash **before** the transaction; if `count !== 1`, roll back and return a safe current-state response.
- Then, in the same transaction: revalidate, decrement stock conditionally, create the order. Any failure rolls back everything, including the gate update, so the draft is preserved.

## A-10 — Operational notes (extends §3.3, §11, §14.2)

- The dashboard passcode is a **random value of at least 12 characters**, unique to this demo. There is no login throttling, so length is the protection. **Change it after judging ends** (update the Vercel environment variable and redeploy).
- Display all dashboard times in the **Africa/Algiers** time zone.
- `DEMO_AI_CALLS_PER_HOUR` stays configurable. Raise it during the judging window if needed, within the Gemini quota, and document this in the README.
- Reset deletes messages, so it also resets the hourly count. This is accepted.

## A-11 — Environment, packages and Prisma (extends §3.1, §3.3)

- Add to the environment variable list: `DIRECT_URL` (Neon **direct** connection, used for migrations) and `GEMINI_MODEL` (model name read from the environment, never hardcoded). `DATABASE_URL` is the **pooled** URL used at runtime. `.env.example` lists every variable with placeholders only.
- The package manager is **npm**.
- Pin Prisma to the newest **stable** release (verify with `npm view prisma dist-tags`; do not use a release candidate). Follow the **current official Prisma documentation for the installed version** (Next.js + Neon), including any required config file or database driver adapter. Do not copy older tutorials.
- Make sure `prisma generate` runs during the Vercel build (for example via a `postinstall` script).
- **Day 2 starts with** installing Prisma, applying the first migration and reading `Business` through Prisma on the deployed app. If this takes more than one focused hour, stop, record the exact error, and ask for help.

## A-12 — Day 1 deviation (clarifies §17 Day 1)

Day 1's database check uses plain `pg` with a temporary table and Prisma is **not** installed yet. The temporary test routes are deleted after verification so strangers cannot trigger database or Gemini calls. Day 1's exit criterion is unchanged.

## A-13 — Document status

Version 1.1 is frozen. Changes after this point require a real correctness, security, feasibility or deadline reason, and must be recorded in this addendum before building around them.

## A-14 — Public demo access (extends §11, §12.6, §14.2; supersedes the passcode requirement for public visitors)

**Owner decision, recorded here as A-13 requires.**

- **Judges must be able to use the demo with NO passcode.** The public `/api/orders` and `PATCH /api/orders/[id]` endpoints require no passcode.
- An **anonymous per-browser visitor cookie** scopes the order list and the order actions to that visitor's own orders. The cookie holds a random token; the database stores only its SHA-256 hash, on the Conversation that created the order.
- The passcode is **kept only for a hidden `/admin` owner view** that lists all orders and can later run the reset. It is not linked from anywhere and carries `noindex` metadata.
- **Reason:** judging friction (a judge who cannot get in judges nothing) and cross-visitor privacy (one visitor must never see another visitor's name and phone number).
- This relaxes §11's passcode requirement for public visitors only. Everything else in §11 stands: server-side verification of every protected resource, no passcode in the repository, and the passcode still published in the submission description and demo video.

## A-15 — Day 11: reset visibility, starting stock, per-minute cap and diagnostics (extends §10.4, §11, §12.8, §14.2)

**Owner decisions, recorded here as A-13 requires.**

- **1. Reset is an owner-only action.** It exists solely inside `/admin` behind a valid passcode session (`POST /api/admin/reset`, §11.2). There is no reset control, link or hint anywhere on the public `/` page, and a judge never sees it. Unauthenticated calls get 401.
- **2. New starting stock.** The seeded starting quantities change to **Baskets nike 30, Sweat a capuche 30, T-shirt coton bio 40, T-shirt enfant 40, jeans homme 6**. *Reason: judges must not run out of stock mid-demo.* **jeans homme deliberately stays low at 6** so the out-of-stock and price-changed paths stay easy to demonstrate on demand. Product names, prices, sizes, colours and descriptions are unchanged. These numbers live in exactly one module, which the seed, the stock restore helper and the reset all read, so they cannot drift.
- **3. Per-minute global AI-call cap.** A new rolling per-minute cap applies on top of the existing hourly cap, defaulting to **12 calls per minute**, overridable with `DEMO_AI_CALLS_PER_MINUTE` and read with a **code default** when the variable is unset. It uses the same database-count approach as the hourly cap, so it needs no extra state. Exceeding it returns the existing friendly localized busy template without calling Gemini, and is logged under a reason distinct from `minute`, `hour`, `conversation` and `gemini-quota`. **Failed calls still count**, exactly as for the hourly cap.
- **4. Diagnostic logging.** Concise server-side logs go through one helper with a strict field **allowlist**: event name, outcome, reason, duration in ms, language, phase and counts. Message text, customer names, phones, addresses, order contents, cookies, visitor tokens, passcodes, raw model output and data-bearing stack traces are **never** logged. A test feeds sensitive sample values through the helper and asserts none of them appears in the output.
