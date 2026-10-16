# AI Employee — Project Status

Updated: 18 October 2026 (end of Day 8)

## Current state

Days 1-8 of 14 complete. Deployed on Vercel, backed by Neon PostgreSQL through
Prisma. Answers product questions, collects order details in Arabic, French and
English, shows a backend-built localized summary with a SHA-256 confirmation
hash, and creates exactly one transactional Order from one explicit confirmation.
All 20 spec 16.2 scenarios, the out-of-stock race and the Gemini-failure test pass
on the live deployment in ar, fr, Latin-script Darija and en. No dashboard yet.

## Stack

Next.js 16.4.0 (App Router, Turbopack, `cacheComponents`) · React 19.3.0 · TypeScript ^5 · Tailwind ^4 · Prisma 7.10.0 + @prisma/adapter-neon · @google/genai 2.28.0 · zod 4.6.7 · pg 8.23.1 · Node 24.20.0 · Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL` for migrations) · Vercel Hobby, region pinned to `fra1`.

## Key decisions

- **Prisma 7.10.0, not 8** — npm `latest` points at `8.0.0-rc.22`; A-11 forbids RCs.
- **Gemini `gemini-3.5-flash-lite`** — `gemini-3.8-flash` measured 41-60 s/call, over the 20 s budget.
- **69 wilayas** (Loi 26-06, Decret 26-206). Audit: 276 inputs, **0 failures, 0 collisions**.
- **Fees: office 400/500/600 DA by code, HOME = office + 200.** Explicit demo values because the fee feeds the confirmation hash.
- **The backend owns every number.** Gemini never supplies prices, fees, totals, canonical identities or the summary text.
- **Gemini picks en vs fr for Latin script**, so the backend cannot force French there; the conversation-language rule is what keeps Darija stable.

## Day 8 — language and reliability

- **English can now be answered in English.** The backend used to derive the reply language from script alone, which can only yield `ar` or `fr`, then told the model `Reply in: fr`. Rules now live in `lib/language.ts`: Arabic script forces `ar`, an explicit "speak X" wins, otherwise the model's returned `en`/`fr` decides. `fallbackLanguage` stays on the failure path only.
- **Latin-script Darija stays French**, with worked Darija examples in the prompt and a rule that one short turn does not switch an established conversation language.
- **Arabic-Indic digits no longer force Arabic.** They sit in the Arabic Unicode block but carry no language, so they are skipped by the script count.
- **Article-free Arabic wilaya names resolve.** `جلفة` failed while `الجلفة` worked, and `المسعد` failed while `مسعد` worked. A bounded fallback strips a leading `ال`; verified safe (138 distinct keys from 138 names, 0 collisions).
- `scripts/scenarios.mjs` grew 20 spec 16.2 scenarios (101-121), takes `BASE_URL`, is resumable by number, and **exits 64 on an unknown scenario number** instead of silently running everything.
- Full results in `docs/TEST-RESULTS.md`.

## Day 6-7 core

- `lib/order-summary.ts` — canonical normalization, trusted pricing, the verbatim 13.1 ar/fr/en summary, and `buildConfirmationHash` (SHA-256 over a fixed-key JSON of the normalized draft plus `unitPrice`, `deliveryPrice`, `total`). One formatter feeds both the summary and the hash.
- `lib/confirmation-gate.ts` — `evaluateConfirmationGate`, pure and side-effect free.
- `lib/order-create.ts` — `createOrderFromConfirmedDraft`, the ONLY place that creates an Order or changes stock. Recomputes the hash before the transaction; in one transaction it consumes the gate with a single conditional `updateMany` requiring exactly one row, revalidates against the freshly read `Product` row, decrements stock with `WHERE stockQuantity >= quantity` requiring one row, then inserts the Order with status `NOT_YET_CONFIRMED`. Any failure rolls back everything, including the gate update.
- `lib/templates.ts` — every 13.x template exists in ar/fr/en and is backend-authored.

## Environment (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`, `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`. All 8 are set in Vercel Production and mirrored in the git-ignored local `.env`.

## Known deviations

- FAILED AI rows store `content: null` so the A-06 history loader cannot read an error message as a real reply. `fallbackLanguage` is a heuristic, not a classifier.
- The chat response echoes `__draft`, `__hash`, `__gate` for the scenario runner. They hold only allowlisted customer fields, never `rawAiOutput`.
- Gemini extracts, the backend decides: the model may decline an invalid option in its own words, so the rejection template does not always fire — the invalid value is still never stored.
- A short English-looking turn inside a Darija conversation is genuinely ambiguous; the model decides and the conversation-language rule keeps it stable in practice.
- A missing delivery fee cannot be forced through the public endpoint without mutating data, so it is covered by unit tests, not a live scenario.

## Gotchas

- Next 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route exports; `maxDuration` is allowed. Prisma 7 needs `prisma.config.ts`, a generator `output`, a driver adapter and `dotenv`; CHECK constraints are raw SQL.
- PowerShell mangles UTF-8 — use a Node `fetch` client for anything Arabic, and never round-trip a UTF-8 file through `WriteAllText`. A free-form `payload` object makes Gemini return `{}`.
- `git commit -m` breaks on PowerShell with `\"` or `/api`; use `git commit -F`.

## Operational notes

- **`DEMO_AI_CALLS_PER_HOUR` is configured in Vercel.** Its value has not been read or verified from here, so nothing is claimed about the remaining allowance beyond the measured AI-row counts. Decide the final value on Day 12 (A-10).
- **The local app and the deployed app share one Neon database**, so local runs spend the deployed hourly allowance. Run them an hour apart.
- The cap is checked BEFORE Gemini is called, so probing `POST /api/chat` to ask whether the budget is left costs **zero** Gemini calls.
- The deployed URL is `https://ai-employee-lovat.vercel.app`. Per-deployment `*.vercel.app` URLs sit behind SSO and return a 302 to a login page.
- A stale `next start` can hold port 4200 and silently serve an OLD build. Check the **LISTENING** owner: `Get-NetTCPConnection -LocalPort 4200` also returns TIME_WAIT rows whose owner is PID 0, and "killing" those never frees the port.
- `npm run test:orders` writes real rows. Run `npm run test:restore-stock` afterwards; it never deletes an Order. The table holds **33 fake test Orders** that the **Day 11 reset** clears.

## Test commands

`npm run test:unit` (150 offline checks) · `npm run test:orders` (79 checks, real DB) · `npm run test:restore-stock` (UPDATE-only) · `npm run test:scenarios -- <url>` (full chat suite).

## Next steps

1. **Day 9** — dashboard passcode and protected order list.
2. **Days 10-11** — confirm/cancel with stock restore, demo reset.
3. Replace the dashboard passcode placeholder before judging.