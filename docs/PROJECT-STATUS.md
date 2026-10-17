# AI Employee — Project Status

Updated: 20 October 2026 (layout fixes)

## Current state

Days 1-10 of 14 complete, plus the UI redesign and a layout-fix pass. Deployed on Vercel, backed by Neon PostgreSQL through Prisma. A customer can chat in Arabic, Latin-script Darija, French or English, collect an order, see a backend-built summary, confirm it, and **create exactly one transactional Order**. The visitor sees only their own orders and can confirm or cancel them. A hidden owner view lists every order.

## Stack

Next.js 16.4.0 (App Router, Turbopack, `cacheComponents`) · React 19.3.0 · TypeScript ^5 · Tailwind ^4 · Prisma 7.10.0 + @prisma/adapter-neon · @google/genai 2.28.0 · zod 4.6.7 · pg 8.23.1 · Node 24.20.0 · Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL` for migrations) · Vercel Hobby, region pinned to `fra1`.

## Key decisions

- **Prisma 7.10.0, not 8** — npm `latest` points at `8.0.0-rc.22`; A-11 forbids RCs.
- **Gemini `gemini-3.5-flash-lite`** — `gemini-3.8-flash` measured 41-60 s/call, over the 20 s budget.
- **69 wilayas** (Loi 26-06, Decret 26-206). Audit: 276 inputs, **0 failures, 0 collisions**.
- **Fees: office 400/500/600 DA by code, HOME = office + 200.** Explicit demo values because the fee feeds the confirmation hash.
- **The backend owns every number.** Gemini never supplies prices, fees, totals, canonical identities or the summary text.

## Redesign — everything on one page

`/` now carries the whole demo: brand header, a three-step strip, the real catalog, the conversation and the order the shop owner would act on. **No passcode, no second screen.**

- **Two panels.** Desktop (>=1024px): side by side, one fixed height each. Below that: a sticky `role="tablist"` with Chat and Orders (count badge), driven by `DemoShell`.
- **`DemoShell`** owns the state the panels share. When `/api/chat` reports `orderCreated`, it bumps a `refreshToken`, so `MyOrders` reloads at once and the new card is highlighted and scrolled to. A banner offers a jump to the Orders tab. The 15 s auto-refresh pauses while the tab is hidden **and while a mutation is pending**, so it can never race a click.
- `app/components/catalog-strip.tsx` reads PostgreSQL on the server. `await io()` keeps the read out of the static shell, so `/` is partial-prerendered and the prices are fresh on every request. Colour swatches come only from a product's real `options.colors`; there are no images at all.
- `app/dashboard/MyOrders.tsx` renders the full order card: `#` plus the first 6 id characters, the Algiers timestamp, a status chip with one plain-English line, customer name, phone as `0550 12 34 56`, delivery method, wilaya, the address **only** for home delivery, the item with colour and size, and a unit-price x quantity / delivery-fee / total breakdown computed in integer minor units. No payment line, because there is none.
- `/dashboard` now redirects to `/`. `/admin` is untouched.
- **Fonts** are self-hosted at build by `next/font`: Playfair Display, Plus Jakarta Sans and Noto Naskh Arabic (`arabic` subset). The two Latin faces have no Arabic coverage, so without the third the browser synthesises Arabic and it looks wrong. Icons are inline SVG: no icon font, no CDN, no external stylesheet or script.
- Copy carries no claim that cannot be true: no "encrypted", no "discretion", no "private clienteling".

## Layout fixes (owner screenshot at 1920x1080)

- **The page no longer forces one screen height.** It was `h-dvh` + `overflow-hidden`, which squeezed the transcript to about one line and clipped the orders list. It is now `min-h-dvh` in normal flow, so the page scrolls.
- **Both panels get one fixed height**: `clamp(620px, 82dvh, 880px)` on desktop, `clamp(520px, calc(100dvh - 190px), 760px)` below 1024px. Inside each panel the header and toolbar are `shrink-0`, the transcript and the orders list are `flex-1 min-h-0 overflow-y-auto`, and the composer sits at the bottom.
- **The orders list has its own scroll container** with 24px of bottom padding, so the last card's buttons are always reachable. When an order is created the list scrolls to the new card by setting `scrollTop` on that container from the card's `offsetTop`. `scrollIntoView` is never used.
- **The transcript has `min-h-80` (320px)** and its empty-state hint is centred inside it, so it can never be cut off.
- **The composer auto-grows** from 2 rows to about 6, then scrolls inside itself; height comes from `scrollHeight`, not a CSS row hack. Enter sends, Shift+Enter inserts a newline, a `n/500` counter sits under it, and it keeps `readOnly` (not disabled) while pending so focus is never lost.
- **The three quick-start chips are gone**, with the array and its styles removed. "New conversation" moved into the chat panel header as a small button. Padding on the "How this works" card, the catalog row and the tab switcher was trimmed. **No copy was changed.**

## Day 10 — order actions and public visitor access (A-14)

**Owner decision (addendum A-14): judges use the demo with NO passcode.** A public page shows only the orders created from that visitor's own browser. The passcode dashboard became a hidden owner view.

- `/dashboard` used to be the standalone visitor list; it now redirects to `/` and the same `MyOrders` component is embedded in the main page. `/admin` — the owner view, passcode protected, **not linked from anywhere**, with `noindex` metadata. Shows every order, including those made before A-14.
- `lib/visitor.ts` — a 32-byte random token in the `ae_visitor` cookie (HttpOnly, SameSite=Lax, Secure in production, path `/`, 30 days). The database stores **only** its SHA-256 hash, on the Conversation. The raw token is never stored, logged or returned.
- `/api/chat` mints the cookie when absent and stamps new Conversations with the hash. Supplying a conversationId whose stored hash does not match is refused **before any Gemini call**, with an error that does not reveal that the conversation exists.
- New migration `20261017013332_add_conversation_visitor_key_hash`: a nullable `visitorKeyHash` on Conversation plus an index. Additive only; no applied migration was edited. Existing rows keep `null` and are therefore owner-only.
- `lib/order-actions.ts` — `confirmOrder` (conditional `NOT_YET_CONFIRMED` to `CONFIRMED`, no stock change) and `cancelOrder` (ONE transaction: conditional transition to `CANCELLED` requiring count 1, then restore that order's quantity read inside the transaction). Both return the current state on a conflict. Shared by the public and admin routes.
- `GET /api/orders` is per-visitor with `Cache-Control: private, no-store` and `Vary: Cookie`. `PATCH /api/orders/[id]` takes a strict `{"action":"CONFIRM"|"CANCEL"}` body, checks Origin, and answers **404** (never 403) for an order that is not yours.

## Day 6-9 core

- `lib/order-summary.ts` — canonical normalization, trusted pricing, the verbatim 13.1 ar/fr/en summary, and `buildConfirmationHash` (SHA-256 over a fixed-key JSON of the normalized draft plus `unitPrice`, `deliveryPrice`, `total`). One formatter feeds both the summary and the hash.
- `lib/confirmation-gate.ts` — `evaluateConfirmationGate`, pure and side-effect free.
- `lib/order-create.ts` — `createOrderFromConfirmedDraft`, the ONLY place that creates an Order or changes stock on creation. Recomputes the hash before the transaction; in one transaction it consumes the gate with a single conditional `updateMany` requiring exactly one row, revalidates against the freshly read `Product` row, decrements stock with `WHERE stockQuantity >= quantity` requiring one row, then inserts the Order. Any failure rolls back everything, including the gate update.
- `lib/auth.ts` — HMAC-SHA256 session cookie carrying only an expiry, HttpOnly, Secure in production, SameSite=Lax, 12 hours. **Fails closed** when `DASHBOARD_PASSCODE` (<12) or `SESSION_SECRET` (<32) is missing or short.
- `lib/language.ts` — reply-language rules. Arabic script forces `ar`; an explicit "speak X" wins; otherwise the model decides `en`/`fr`. Arabic-Indic digits do not force Arabic.
- Every 13.x template exists in ar/fr/en and is backend-authored.

## Environment (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`, `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`. All 8 are set in Vercel Production and mirrored in the git-ignored local `.env`.

**The demo passcode** lives only in the Vercel environment. It is published in the **Thirduni submission description and the demo video**, never in this repository, and **must be changed after judging ends** (A-10). Judges need no passcode at all.

## Known deviations

- A short English-looking turn inside a Darija conversation is genuinely ambiguous; the model decides and the conversation-language rule keeps it stable in practice.
- A missing delivery fee cannot be forced through the public endpoint without mutating data, so it is covered by unit tests, not a live scenario.
- The admin session token is stateless, so a copy captured before logout stays valid until its 12 hour expiry. That is the design spec 11.1 describes.
- Gemini may decline an invalid option in its own words, so the rejection template does not always fire; the invalid value is still never stored.

## Gotchas

- Next 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route exports; `maxDuration` is allowed. A `cookies()` read is a request read, so `/admin` needs `export const instant = false`. Route handler `params` is a **Promise**.
- PowerShell mangles UTF-8 — use a Node `fetch` client for Arabic and never round-trip a UTF-8 file through `WriteAllText`.
- A free-form `payload` object makes Gemini return `{}`. `git commit -m` breaks on PowerShell with `\"`; use `git commit -F`.
- A stale `next start` can hold port 4200 and serve an OLD build. Check the **LISTENING** owner; `Get-NetTCPConnection -LocalPort` also returns TIME_WAIT rows whose owner is PID 0.
- **The local app and the deployed app share one Neon database**, so local runs spend the deployed hourly allowance.
- Next appends its own RSC tokens to `Vary`, so assert `Cookie` is *in* the header rather than equal to it.
- Under `cacheComponents`, Prisma in a page needs `await io()` (from `next/cache`) inside a `<Suspense>` boundary; without it the read lands in the static shell. `next/font` emits hashed `*_variable` class names on `<html>` and the family names only in the generated CSS, so a font assertion must look at the stylesheet, not the HTML.
- `react-hooks/set-state-in-effect` rejects a plain fetch-on-mount. Deferring the first load with `setTimeout(…, 0)` keeps it a data fetch instead of a render-phase state change.
- Playwright can be installed **outside** the repo (`npm install playwright --prefix %TEMP%\opencode\pw`, then `npx --prefix ... playwright install chromium`) and driven with `require()` on its module path. That keeps it out of `package.json` and out of Git.
- When measuring a tabbed layout in a headless browser, **switch tabs before measuring**. A hidden panel reports `clientHeight` 0, which looks exactly like a broken one.
## Operational notes

- **`DEMO_AI_CALLS_PER_HOUR` is configured in Vercel.** Its value has not been read or verified from here; decide the final value on Day 12.
- The deployed URL is `https://ai-employee-lovat.vercel.app`. Per-deployment `*.vercel.app` URLs sit behind SSO. Day 8 results are in `docs/TEST-RESULTS.md`. The table holds **fake test Orders** that the **Day 11 reset** clears.
- `npm run test:orders` writes real rows. Run `npm run test:restore-stock` afterwards; it never deletes an Order.

## Test commands

`npm run test:unit` (189 offline checks) · `npm run test:orders` (79 checks, real DB) · `npm run test:restore-stock` (UPDATE-only) · `npm run test:scenarios -- <url>` (full chat suite).

## Next steps

1. **Day 11** — protected demo reset: restore seeded stock and clear demo orders, conversations and messages.
2. **Change the demo passcode after judging ends** (A-10).