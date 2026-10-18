# AI Employee — Project Status

Updated: 19 October 2026 (end of Day 12)

## Current state

Days 1-12 of 14 complete, plus the UI redesign, the layout fixes and the README. Deployed on Vercel, backed by Neon PostgreSQL through Prisma. A customer can chat in Arabic, Latin-script Darija, French or English, collect an order, see a backend-built summary, confirm it, and **create exactly one transactional Order**. The visitor sees only their own orders and can confirm or cancel them. A hidden owner view lists every order and can reset the demo.
## Stack

Next.js 16.4.0 (App Router, Turbopack, `cacheComponents`) · React 19.3.0 · TypeScript 5.9 · Tailwind 4.3 · Prisma 7.10.0 + @prisma/adapter-neon · @google/genai 2.28.0 · zod 4.6.7 · Node 24.20.0 · Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL`) · Vercel Hobby, `fra1`. The full table is in `README.md`.

## Key decisions

- **Prisma 7.10.0, not 8** — npm `latest` points at `8.0.0-rc.22`; A-11 forbids RCs.
- **Gemini `gemini-3.5-flash-lite`** — `gemini-3.8-flash` measured 41-60 s/call, over the 20 s budget.
- **69 wilayas** (Loi 26-06, Decret 26-206). Audit: 276 inputs, **0 failures, 0 collisions**.
- **Fees: office 400/500/600 DA by code, HOME = office + 200.** Explicit demo values because the fee feeds the confirmation hash.
- **The backend owns every number.** Gemini never supplies prices, fees, totals, canonical identities or the summary text. Owner reasoning for the access model: a judge who cannot get in judges nothing (A-14).
- **Every test-only injection is a function parameter**, never a route argument and never environment-driven: `__testClient`, `__testFailAfterDeletes`, `__testFailAfterStatusUpdate`.

## The one-page demo (Redesign + layout fixes)

`/` carries everything: brand header, a three-step strip, the real catalog, the conversation and the order the shop owner acts on. **No passcode, no second screen.**

- **Two panels**, `clamp(620px, 82dvh, 880px)` on desktop, `clamp(520px, calc(100dvh - 190px), 760px)` below 1024px where they become a sticky `role="tablist"` with Chat and Orders. The page is `min-h-dvh` and scrolls normally; inside a panel the header/toolbar are `shrink-0` and the transcript and orders list are `flex-1 min-h-0 overflow-y-auto`. **They scroll internally, never the window.** The new card is reached by setting `scrollTop` on the list container; `scrollIntoView` is never used.
- **`DemoShell`** owns the shared state: on `orderCreated` it bumps a `refreshToken`, so `MyOrders` reloads, highlights the new card and shows a jump banner. The 15 s auto-refresh pauses while the tab is hidden **and while a mutation is pending**.
- **The composer auto-grows** 2 to about 6 rows, then scrolls inside itself. Enter sends, Shift+Enter inserts a newline, an `n/500` counter sits under it, and it stays `readOnly` (not disabled) while pending so focus is never lost.
- `catalog-strip.tsx` reads PostgreSQL on the server; `await io()` keeps it out of the static shell, so `/` is partial-prerendered and prices are fresh per request. Swatches come only from a product's real `options.colors`; no images.
- `MyOrders.tsx` renders the full card: `#` + 6 id characters, Algiers timestamp, status chip plus one plain-English line, name, phone as `0550 12 34 56`, delivery method, wilaya, the address **only** for home delivery, the item, and a breakdown in integer minor units.
- **Fonts** self-hosted at build by `next/font`: Playfair Display, Plus Jakarta Sans and Noto Naskh Arabic (the Latin faces have no Arabic coverage). Icons are inline SVG. `/dashboard` redirects to `/`; `/admin` is unlinked and `noindex`.

## Day 12 — hardening and README

- **`README.md` rewritten** for judges and developers: 60-second try-it, what is and is NOT implemented, the "AI proposes, the backend decides" principle, a Mermaid diagram, the stack with versions read from `node_modules`, project structure, local setup, the environment table, the owner view, both reset routes, testing, limitations and next steps. **Fresh-clone proof:** cloned the public repo into a temp folder outside the repository, copied nothing, ran `npm ci` and `npm run build` with fake placeholders — **the build succeeds with no database and no real key**, and `npm run test:unit` passes 237/237. The folder was deleted. Every command, file and variable was verified against `package.json` and `.env.example`.
- **Security headers** in `next.config.ts`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a `Permissions-Policy` denying every device capability. **No CSP on purpose**: Next emits inline bootstrap scripts, and a nonce-less CSP would need `unsafe-inline` and buy nothing. Verified present on `/`, `/admin`, `/api/catalog`, `/api/orders`. `/api/chat` and `/api/catalog` were the only routes without `no-store`; both now send it, because a shared cache could serve a stale price.
- **Hostile-text proof (68 checks).** The transcript and the order card were rendered with `<script>`, `<img onerror>`, `<svg onload>`, `javascript:`, a quote break-out, a SQL string, a 20 000 character token and Arabic carrying HTML. Only React's own tags may appear, and only inside a real tag may an `on*=` handler or `javascript:` exist. `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`: **0 matches** in `app/` and `lib/`.
- **`npm audit --omit=dev`: 4 high, 0 critical.** All four are the Prisma CLI chain (`mysql2`, `deepmerge-ts`). This project uses PostgreSQL via `@prisma/adapter-neon`, `mysql2` is absent from the build output, and the upstream fixes need a Prisma release A-11 forbids, so nothing was forced. Reported in the README.
- **`scripts/reset-demo.ts` + `npm run reset-demo`.** The owner's command-line reset: without `--confirm-reset` it is a dry run that only prints counts. It calls the same `resetDemoData()` as the web route and no app file imports it. Dry run verified, counts unchanged.
- **Layout re-measured** at five viewports: no horizontal overflow anywhere, transcript 320–613 px and scrolling internally, orders list scrolling internally, composer and the 44 px send button fully in the viewport after page scroll, tabs switching below 1024 px, zero console errors. Two of my probes were wrong first time (a hidden panel reads `clientHeight` 0; a flex child shrinks so it never scrolls) — harness bugs, fixed in the harness.

## Day 11 — reset, limits and diagnostics (A-15)

- **`lib/seed-data.ts` is the single source of truth** for the business, catalog and starting stock; the seed script, the stock helper, the reset and the test fixtures all read it. Only stock moved: **Baskets 30, Sweat 30, T-shirt coton bio 40, T-shirt enfant 40, jeans homme 6**. Jeans stay low so the out-of-stock demo always works.
- **`lib/reset.ts`** — one transaction: Message, then Order, then Conversation (foreign-key order), then restore each seeded Product's stock. Business and Product rows are never deleted. Idempotent. The test-only injection is a parameter thrown *between* the deletes and the restock.
- **`POST /api/admin/reset`** — session required (401), Origin checked, any body field 400, `no-store`, answers only `{"ok":true}` or a generic error. The reset UI lives only in `/admin` behind typing RESET; there is **no reset link, hint or button on the public page**.
- **Per-minute AI-call cap**: default 12, `DEMO_AI_CALLS_PER_MINUTE`, same database-count method as the hourly cap, checked before it, answers the busy template, no model call, reason `minute`. Failed calls count.
- **`lib/diagnostics.ts`** — one logger, strict field allowlist, fixed vocabularies per event. Message text, names, phones, addresses, cookies, tokens, passcodes and raw model output cannot be logged. **`lib/gemini.ts` gained a test-only client parameter** (never a route argument, never env-driven) so timeout, invalid JSON, schema-invalid output, empty reply, 429, auth and a thrown network error all fail closed offline.

Verified: unit 189, integration 79, reset 39, HTTP reset 48, caps 28, offline 67, race 12; three full orders in ar/fr/en. Gemini calls: 23 of 30.

## Day 10 — order actions and public visitor access (A-14)

**Owner decision (A-14): judges use the demo with NO passcode.** The public page shows only the orders created from that visitor's own browser; the passcode dashboard became a hidden owner view.

- `lib/visitor.ts` — a 32-byte random token in the `ae_visitor` cookie (HttpOnly, SameSite=Lax, Secure in production, path `/`, 30 days). The database stores **only** its SHA-256 hash, on the Conversation.
- `/api/chat` mints the cookie when absent and stamps new Conversations with the hash. A conversationId whose stored hash does not match is refused **before any Gemini call**, without revealing that the conversation exists. Migration `20261017013332_add_conversation_visitor_key_hash` added the column and its index; no applied migration edited.
- `lib/order-actions.ts` — `confirmOrder` (no stock change) and `cancelOrder` (ONE transaction: conditional transition to `CANCELLED` requiring count 1, then restore that order's quantity read inside it). `PATCH /api/orders/[id]` takes a strict `{"action":...}` body, checks Origin, and answers **404** (never 403) for an order that is not yours.

## Day 6-9 core

- `lib/order-summary.ts` — canonical normalization, trusted pricing, the verbatim 13.1 ar/fr/en summary, and `buildConfirmationHash` (SHA-256 over a fixed-key JSON of the normalized draft plus the three amounts). One formatter feeds both the summary and the hash.
- `lib/confirmation-gate.ts` — `evaluateConfirmationGate`, pure and side-effect free.
- `lib/order-create.ts` — `createOrderFromConfirmedDraft`, the ONLY place that creates an Order or changes stock on creation. It recomputes the hash before the transaction; in one transaction it consumes the gate with a single conditional `updateMany` requiring exactly one row, revalidates against the freshly read `Product` row, decrements stock with `WHERE stockQuantity >= quantity` requiring one row, then inserts the Order. Any failure rolls back everything, including the gate update.
- `lib/auth.ts` — HMAC-SHA256 session cookie carrying only an expiry, HttpOnly, Secure in production, SameSite=Lax, 12 hours. **Fails closed** when `DASHBOARD_PASSCODE` (<12) or `SESSION_SECRET` (<32) is missing or short.
- `lib/language.ts` — reply-language rules: Arabic script forces `ar`; an explicit "speak X" wins; otherwise the model decides `en`/`fr`.

## Environment (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`, `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`, and the optional `DEMO_AI_CALLS_PER_MINUTE` (code default 12). The first 8 are set in Vercel Production and mirrored in the git-ignored local `.env`; `README.md` and `.env.example` list the same nine.

**The demo passcode** lives only in the Vercel environment. It is published in the **Thirduni submission description and the demo video**, never in this repository, and **must be changed after judging ends** (A-10). Judges need no passcode.

## Known deviations

- A short English-looking turn inside a Darija conversation is genuinely ambiguous; the model decides.
- A missing delivery fee cannot be forced through the public endpoint without mutating data, so it is covered by unit tests, not a live scenario.
- The admin session token is stateless (spec 11.1), so a token captured before logout stays valid until its 12 hour expiry. Logout clears the cookie; there is no revocation list.
- Gemini may decline an invalid option in its own words, so the rejection template does not always fire; the invalid value is still never stored.
- The A-09 confirmation hash covers the draft content, not the conversation, so two identical orders legitimately share a hash. Each conversation owns its own gate row, which is what makes the race safe.
- `npm audit` reports 4 high advisories in the Prisma CLI chain; see Day 12 above and the README.

## Gotchas

- Next 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route exports; `maxDuration` is allowed. A `cookies()` read is a request read, so `/admin` needs `export const instant = false`. Route handler `params` is a **Promise**.
- PowerShell mangles UTF-8 — use a Node `fetch` client for Arabic, never round-trip a UTF-8 file through `WriteAllText`, and use `git commit -F` because `git commit -m` breaks on `\"`. A free-form `payload` object also makes Gemini return `{}`.
- A stale `next start` can hold port 4200 and serve an OLD build. Check the **LISTENING** owner; `Get-NetTCPConnection -LocalPort` also returns TIME_WAIT rows whose owner is PID 0.
- **The local app and the deployed app share one Neon database**, so local runs spend the deployed hourly allowance.
- Next appends its own RSC tokens to `Vary`, so assert `Cookie` is *in* the header rather than equal to it. Under `cacheComponents`, Prisma in a page needs `await io()` inside a `<Suspense>` boundary, and `next/font` puts the family names only in the generated CSS.
- `react-hooks/set-state-in-effect` rejects a plain fetch-on-mount. Deferring the first load with `setTimeout(…, 0)` keeps it a data fetch.
- **Log lines: Vercel → the project → Logs → Runtime Logs.** Filter `event=admin_login`. Outcomes: `success` (a valid session was issued), `mismatch` (the submitted passcode was wrong), `not_configured` (`DASHBOARD_PASSCODE` or `SESSION_SECRET` is missing or below its minimum, so login fails closed), `bad_origin` (the Origin did not match the host), `bad_body` (the JSON was malformed or `passcode` was missing/too long). Nothing secret is logged: only the outcome and the duration.
- Playwright installs **outside** the repo (`npm install playwright --prefix %TEMP%\opencode\pw`, then `npx --prefix ... playwright install chromium`) and is driven with `require()` on its module path. Two traps: a hidden tabbed panel reports `clientHeight` 0, and a probe div inside a **flex column** shrinks to nothing, so a "does it scroll" check needs `flex: none` on the probe.
- **Never run a Gemini scenario in parallel with another suite.** `scripts/order-integration.ts` deliberately changes a product price to exercise A-09, which makes a concurrent confirmation return `price-changed` instead of creating the order.

## Operational notes and next steps

- **`DEMO_AI_CALLS_PER_HOUR` is configured in Vercel.** Its value has not been read or verified from here; set the final value on Day 13.
- Deployed at `https://ai-employee-lovat.vercel.app`; per-deployment `*.vercel.app` URLs sit behind SSO. Day 8 results are in `docs/TEST-RESULTS.md`.
- Scripts: `test:unit` (237 offline) · `test:orders` (79, **writes orders**) · `test:restore-stock` (UPDATE-only) · `test:scenarios -- <url>` · `reset-demo` (dry run unless `--confirm-reset`). **Reset after any suite that writes orders, never before.**
- **Day 13** — judging dry run: record the demo video, check every link logged out, set the final hourly cap, then reset the demo data as the last step.
- **Day 14** — submission: description (150 words), video, team names, links. Then **change the demo passcode** (A-10).