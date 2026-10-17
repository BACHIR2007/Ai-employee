# AI Employee — Project Status

Updated: 22 October 2026 (end of Day 11)

## Current state

Days 1-11 of 14 complete, plus the UI redesign and a layout-fix pass. Deployed on Vercel, backed by Neon PostgreSQL through Prisma. A customer can chat in Arabic, Latin-script Darija, French or English, collect an order, see a backend-built summary, confirm it, and **create exactly one transactional Order**. The visitor sees only their own orders and can confirm or cancel them. A hidden owner view lists every order and can reset the demo.

## Stack

Next.js 16.4.0 (App Router, Turbopack, `cacheComponents`) · React 19.3.0 · TypeScript ^5 · Tailwind ^4 · Prisma 7.10.0 + @prisma/adapter-neon · @google/genai 2.28.0 · zod 4.6.7 · Node 24.20.0 · Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL`) · Vercel Hobby, region `fra1`.

## Key decisions

- **Prisma 7.10.0, not 8** — npm `latest` points at `8.0.0-rc.22`; A-11 forbids RCs.
- **Gemini `gemini-3.5-flash-lite`** — `gemini-3.8-flash` measured 41-60 s/call, over the 20 s budget.
- **69 wilayas** (Loi 26-06, Decret 26-206). Audit: 276 inputs, **0 failures, 0 collisions**.
- **Fees: office 400/500/600 DA by code, HOME = office + 200.** Explicit demo values because the fee feeds the confirmation hash.
- **The backend owns every number.** Gemini never supplies prices, fees, totals, canonical identities or the summary text. Owner reasoning for the access model: a judge who cannot get in judges nothing (A-14).
- **Every test-only injection is a function parameter**, never a route argument and never environment-driven: `__testClient`, `__testFailAfterDeletes`, `__testFailAfterStatusUpdate`.

## Redesign, layout and the one-page demo

`/` carries the whole demo: brand header, a three-step strip, the real catalog, the conversation and the order the shop owner would act on. **No passcode, no second screen.**

- **Two panels**, `clamp(620px, 82dvh, 880px)` on desktop and `clamp(520px, calc(100dvh - 190px), 760px)` below 1024px, where they become a sticky `role="tablist"` with Chat and Orders. The page is `min-h-dvh` and scrolls normally; inside each panel the header and toolbar are `shrink-0`, the transcript and the orders list are `flex-1 min-h-0 overflow-y-auto`, and the composer sits at the bottom. **The transcript and the orders list scroll internally, never the window.** When an order is created the list scrolls to the new card by setting `scrollTop` on its container from the card's `offsetTop`; `scrollIntoView` is never used.
- **`DemoShell`** owns the shared state: on `orderCreated` it bumps a `refreshToken`, so `MyOrders` reloads at once, highlights the new card and shows a jump banner. The 15 s auto-refresh pauses while the tab is hidden **and while a mutation is pending**.
- **The composer auto-grows** from 2 rows to about 6, then scrolls inside itself; height comes from `scrollHeight`. Enter sends, Shift+Enter inserts a newline, a `n/500` counter sits under it, and it keeps `readOnly` (not disabled) while pending so focus is never lost.
- `app/components/catalog-strip.tsx` reads PostgreSQL on the server; `await io()` keeps it out of the static shell, so `/` is partial-prerendered and prices are fresh per request. Swatches come only from a product's real `options.colors`; no images.
- `app/dashboard/MyOrders.tsx` renders the full order card: `#` + 6 id characters, the Algiers timestamp, a status chip with one plain-English line, name, phone as `0550 12 34 56`, delivery method, wilaya, the address **only** for home delivery, the item, and a breakdown in integer minor units. No payment line, because there is none.
- **Fonts** are self-hosted at build by `next/font`: Playfair Display, Plus Jakarta Sans and Noto Naskh Arabic. The Latin faces have no Arabic coverage, so without the third the browser synthesises Arabic. Icons are inline SVG: no icon font, no CDN, no external stylesheet or script.
- `/dashboard` redirects to `/`. `/admin` is unlinked and `noindex`. Copy makes no claim the demo cannot stand behind: no "encrypted", no "discretion", no "private clienteling".

## Day 11 — reset, limits and diagnostics (A-15)

- **`lib/seed-data.ts` is the single source of truth** for the business, the catalog and the starting stock. `prisma/seed.ts`, `scripts/restore-seed-stock.ts`, `lib/reset.ts` and the test fixtures all read it, so the four cannot drift. Names, prices, sizes, colours and descriptions are unchanged; only stock moved, to **Baskets 30, Sweat 30, T-shirt coton bio 40, T-shirt enfant 40, jeans homme 6**. Jeans stay low on purpose so the out-of-stock demo always works.
- **`lib/reset.ts`** — one transaction: delete Message, then Order, then Conversation (foreign-key order), then set each seeded Product's stock back. Business and Product rows are never deleted. Idempotent. The test-only failure injection is an explicit parameter thrown *between* the deletes and the restock, so a rollback has to undo real work.
- **`POST /api/admin/reset`** — session required (401), Origin checked, any body field rejected with 400, `no-store`, answers only `{"ok":true}` or a generic error. No counts or table names ever leave it. The reset UI lives only in `/admin`, behind typing RESET, with a warning that it destroys every conversation, message and order for every visitor. There is **no reset link, hint or button on the public page**.
- **Per-minute AI-call cap** (A-15): default 12, overridable with `DEMO_AI_CALLS_PER_MINUTE`, counted with the same database-count approach as the hourly cap so it needs no extra state. Checked *before* the hourly cap, answers the friendly busy template, and makes no Gemini call. Its reason is `minute`, distinct from `hourly`, `conversation` and `gemini-quota`. Failed calls count.
- **`lib/diagnostics.ts`** — one logger with a strict field allowlist and fixed vocabularies for event, outcome and reason. Any string outside a vocabulary prints as `-` or `unknown`, and any field not on the list is dropped before stringifying. Message text, names, phones, addresses, cookies, visitor tokens, passcodes, session tokens and raw model output cannot be logged. A test feeds nine sensitive sample values through it and asserts none appears.
- **`lib/gemini.ts` gained a test-only client parameter** (`__testClient`), never a route argument and never environment-driven. It exercises the real parsing and classification path offline: timeout, invalid JSON, schema-invalid output, empty reply, provider 429, auth error and a thrown network error all fail closed, and a failure never moves the draft, phase or hash.

Verified: unit 189/189, integration 79/79, reset 39/39, HTTP reset 48/48, caps 28/28, offline 67/67, race 12/12. Three full orders end to end (ar, fr, en) plus the over-stock refusal. Gemini calls used: **23 of 30**.

## Day 10 — order actions and public visitor access (A-14)

**Owner decision (addendum A-14): judges use the demo with NO passcode.** A public page shows only the orders created from that visitor's own browser. The passcode dashboard became a hidden owner view.

- `/dashboard` used to be the standalone visitor list; it now redirects to `/` and the same `MyOrders` component is embedded in the main page. `/admin` — the owner view, passcode protected, **not linked from anywhere**, `noindex`.
- `lib/visitor.ts` — a 32-byte random token in the `ae_visitor` cookie (HttpOnly, SameSite=Lax, Secure in production, path `/`, 30 days). The database stores **only** its SHA-256 hash, on the Conversation. The raw token is never stored, logged or returned.
- `/api/chat` mints the cookie when absent and stamps new Conversations with the hash. Supplying a conversationId whose stored hash does not match is refused **before any Gemini call**, with an error that does not reveal that the conversation exists. Migration `20261017013332_add_conversation_visitor_key_hash` added the nullable column and its index; additive only, no applied migration edited.
- `GET /api/orders` is per-visitor with `Cache-Control: private, no-store` and `Vary: Cookie`. `PATCH /api/orders/[id]` takes a strict `{"action":"CONFIRM"|"CANCEL"}` body, checks Origin, and answers **404** (never 403) for an order that is not yours.

## Day 6-10 core

- `lib/order-summary.ts` — canonical normalization, trusted pricing, the verbatim 13.1 ar/fr/en summary, and `buildConfirmationHash` (SHA-256 over a fixed-key JSON of the normalized draft plus `unitPrice`, `deliveryPrice`, `total`). One formatter feeds both the summary and the hash.
- `lib/confirmation-gate.ts` — `evaluateConfirmationGate`, pure and side-effect free.
- `lib/order-create.ts` — `createOrderFromConfirmedDraft`, the ONLY place that creates an Order or changes stock on creation. Recomputes the hash before the transaction; in one transaction it consumes the gate with a single conditional `updateMany` requiring exactly one row, revalidates against the freshly read `Product` row, decrements stock with `WHERE stockQuantity >= quantity` requiring one row, then inserts the Order. Any failure rolls back everything, including the gate update.
- `lib/order-actions.ts` — `confirmOrder` (conditional `NOT_YET_CONFIRMED` to `CONFIRMED`, no stock change) and `cancelOrder` (ONE transaction: conditional transition to `CANCELLED` requiring count 1, then restore that order's quantity read inside it). Both return the current state on a conflict.
- `lib/auth.ts` — HMAC-SHA256 session cookie carrying only an expiry, HttpOnly, Secure in production, SameSite=Lax, 12 hours. **Fails closed** when `DASHBOARD_PASSCODE` (<12) or `SESSION_SECRET` (<32) is missing or short.
- `lib/language.ts` — reply-language rules. Arabic script forces `ar`; an explicit "speak X" wins; otherwise the model decides `en`/`fr`. Arabic-Indic digits do not force Arabic.

## Environment (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`, `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`, and the optional `DEMO_AI_CALLS_PER_MINUTE`. The first 8 are set in Vercel Production and mirrored in the git-ignored local `.env`; the ninth falls back to a code default of 12.

**The demo passcode** lives only in the Vercel environment. It is published in the **Thirduni submission description and the demo video**, never in this repository, and **must be changed after judging ends** (A-10). Judges need no passcode.

## Known deviations

- A short English-looking turn inside a Darija conversation is genuinely ambiguous; the model decides and the conversation-language rule keeps it stable in practice.
- A missing delivery fee cannot be forced through the public endpoint without mutating data, so it is covered by unit tests, not a live scenario.
- The admin session token is stateless (spec 11.1), so a token captured before logout stays valid until its 12 hour expiry. Logout clears the cookie; there is no revocation list.
- Gemini may decline an invalid option in its own words, so the rejection template does not always fire; the invalid value is still never stored.
- The A-09 confirmation hash covers the draft content, not the conversation, so two identical orders legitimately share a hash. Each conversation owns its own gate row, which is what makes the race safe.

## Gotchas

- Next 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route exports; `maxDuration` is allowed. A `cookies()` read is a request read, so `/admin` needs `export const instant = false`. Route handler `params` is a **Promise**.
- PowerShell mangles UTF-8 — use a Node `fetch` client for Arabic, never round-trip a UTF-8 file through `WriteAllText`, and use `git commit -F` because `git commit -m` breaks on `\"`. A free-form `payload` object also makes Gemini return `{}`.
- A stale `next start` can hold port 4200 and serve an OLD build. Check the **LISTENING** owner; `Get-NetTCPConnection -LocalPort` also returns TIME_WAIT rows whose owner is PID 0.
- **The local app and the deployed app share one Neon database**, so local runs spend the deployed hourly allowance.
- Next appends its own RSC tokens to `Vary`, so assert `Cookie` is *in* the header rather than equal to it. Under `cacheComponents`, Prisma in a page needs `await io()` inside a `<Suspense>` boundary, and `next/font` puts the family names only in the generated CSS, so a font assertion must read the stylesheet.
- `react-hooks/set-state-in-effect` rejects a plain fetch-on-mount. Deferring the first load with `setTimeout(…, 0)` keeps it a data fetch instead of a render-phase state change.
- Playwright installs **outside** the repo (`npm install playwright --prefix %TEMP%\opencode\pw`, then `npx --prefix ... playwright install chromium`) and is driven with `require()` on its module path. A hidden tabbed panel reports `clientHeight` 0, so switch tabs before measuring.
- **Never run a Gemini scenario in parallel with another suite.** `scripts/order-integration.ts` deliberately changes a product price to exercise A-09, which makes a concurrent confirmation return `price-changed` instead of creating the order. Run suites sequentially, and restore stock first if a previous run consumed it.

## Operational notes

- **`DEMO_AI_CALLS_PER_HOUR` is configured in Vercel.** Its value has not been read or verified from here; decide the final value on Day 12.
- Deployed at `https://ai-employee-lovat.vercel.app`; per-deployment `*.vercel.app` URLs sit behind SSO. Day 8 results are in `docs/TEST-RESULTS.md`.
- `npm run test:orders` writes real rows; run `npm run test:restore-stock` afterwards. To clear them for real, use **Reset demo data** in `/admin`: it needs the passcode and typing RESET.

## Test commands and next steps

`npm run test:unit` (189 offline checks) · `npm run test:orders` (79 checks, real DB) · `npm run test:restore-stock` (UPDATE-only) · `npm run test:scenarios -- <url>` (full chat suite). Day 11 suites are throwaway scripts kept out of Git.

1. **Day 12** — decide the final `DEMO_AI_CALLS_PER_HOUR`, review the log format, and do a full dry run of the judging flow.
2. **Change the demo passcode after judging ends** (A-10).