# AI Employee — Project Status

Updated: 17 October 2026 (end of Day 6)

## Current state

Days 1-6 of 14 complete. Deployed on Vercel, backed by Neon PostgreSQL through
Prisma. Answers product questions, collects order details in Arabic, French and
English, and renders a backend-built localized order summary with a SHA-256
confirmation hash. **No order is created and no stock is touched** — that is
Day 7. No dashboard yet.

## Stack

Next.js 16.4.0 (App Router, Turbopack, `cacheComponents`) · React 19.3.0 · TypeScript ^5 · Tailwind ^4 · Prisma 7.10.0 + @prisma/adapter-neon · @google/genai 2.28.0 · zod 4.6.7 · pg 8.23.1 · Node 24.20.0 · Neon PostgreSQL (pooled `DATABASE_URL`, direct `DIRECT_URL` for migrations) · Vercel Hobby, region pinned to `fra1`.

## Key decisions

- **Prisma 7.10.0, not 8** — npm `latest` points at `8.0.0-rc.22`; A-11 forbids RCs.
- **Gemini `gemini-3.5-flash-lite`** — `gemini-3.8-flash` measured 41-60 s/call, over the 20 s budget.
- **69 wilayas** (Loi 26-06, Décret 26-206). Day 6 audit: 276 inputs, **0 failures, 0 collisions**.
- **Fees: office 400/500/600 DA by code, HOME = office + 200.** Explicit demo values because the fee feeds the hash.
- **Catalog via `GET /api/catalog`** — importing Prisma into a prerendered page fails the build under `cacheComponents`.
- **The backend owns every number.** Gemini never supplies prices, fees, totals, canonical identities or the summary text.
- **Language is not hashed.** A language-only change keeps the hash valid.

## Day 6 deliverables

- `lib/order-summary.ts` — canonical normalization, trusted pricing from the database + `lib/delivery.ts`, integer-minor-unit arithmetic, the verbatim §13.1 ar/fr/en summary, and `buildConfirmationHash` (SHA-256 over a fixed-key JSON of the normalized draft + `unitPrice` + `deliveryPrice` + `total`). One formatter feeds both the summary and the hash, so the hashed string is literally the displayed string.
- `lib/confirmation-gate.ts` — `evaluateConfirmationGate`, pure and side-effect free: phase, stored hash, draft validity, trusted pricing, recomputed hash. Ready for Day 7 to call first inside its transaction.
- `app/api/chat/route.ts` — the summary replaces the model reply when the draft completes; an accepted order-relevant change clears the hash first; a question changes nothing and preserves phase and hash; `CANCEL_DRAFT` clears both; `CREATE_ORDER` is gated and answers neutrally either way.
- `lib/templates.ts` — `CONFIRMATION_RECEIVED` / `CONFIRMATION_REJECTED`. Neither ever says created or placed.
- `lib/system-prompt.ts` — confirmation-intent rules: نعم / oui / yes / wah / confirmi confirm; hmm, wait, maybe, questions and "yes, but make it 3" do not.
- `scripts/unit.ts` — offline unit suite, `npm run test:unit`.

## Environment (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`, `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`. All 8 are set in Vercel Production and mirrored in the git-ignored local `.env`.

## Known deviations

- FAILED AI rows store `content: null` so the A-06 history loader cannot read an error message as a real reply. `fallbackLanguage` is a heuristic, not a classifier; digits-only messages fall back to French.
- The chat response echoes `__draft`, `__hash`, `__gate` for the scenario runner. They hold only allowlisted customer fields, never `rawAiOutput`.
- Gemini extracts, the backend decides: the model may decline an invalid option in its own words, so the rejection template does not always fire — the invalid value is still never stored.
- Arabic wilaya spellings vary; `resolveWilaya` retries once with alef/ya/teh-marbuta collapsed, so `تيسمسيلت` and `تسمسيلت` both reach code 38.
- A missing delivery fee cannot be forced through the public endpoint without mutating data, so it is covered by unit tests, not a live scenario.

## Gotchas

- Next 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route exports; `maxDuration` is allowed. Prisma 7 needs `prisma.config.ts`, a generator `output`, a driver adapter and `dotenv`; CHECK constraints are raw SQL.
- PowerShell mangles UTF-8 — use a Node `fetch` client for anything Arabic. A free-form `payload` object makes Gemini return `{}`; the nine keys must be enumerated and required-but-nullable.
- `git commit -m` breaks on PowerShell with `\"` or `/api`; use `git commit -F`.

## Operational notes

- **`DEMO_AI_CALLS_PER_HOUR` is raised in Vercel for testing. Lower it on Day 12** (A-10). Local runs override it at process level; `.env` is never edited or printed.
- `npm run test:scenarios -- <base-url>` paces itself at ≥5 s between calls and ≤12 per rolling minute, stops immediately on a provider 429 or our own cap, and prints the number of Gemini calls made.

## Next steps

1. **Day 7** — transactional order creation: consume the gate with a single conditional `updateMany`, revalidate, decrement stock conditionally, create the order, roll everything back on failure.
2. **Days 9-11** — dashboard passcode, confirm/cancel, reset.
3. Replace the dashboard passcode placeholder before judging.