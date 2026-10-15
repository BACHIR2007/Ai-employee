# AI Employee — Project Status

Updated: 16 October 2026 (end of Day 5)

## Current state

Days 1-5 of 14 complete. The app deploys to Vercel, reads and writes Neon
PostgreSQL through Prisma, answers product questions in Arabic, French and
English, and collects order details in a chat page at `/`. The draft is stored
and validated server-side; no order is created yet (that is Day 7), and there is
no dashboard.

## Stack and versions

| Component | Version |
|---|---|
| Next.js | 16.4.0 (App Router, Turbopack, `cacheComponents` enabled) |
| React | 19.3.0 |
| TypeScript | ^5 |
| Tailwind CSS | ^4 |
| Node.js | 24.20.0 (local), Vercel build image |
| Prisma / @prisma/client | 7.10.0 |
| @prisma/adapter-neon | 7.10.0 |
| @google/genai | 2.28.0 |
| zod | 4.6.7 |
| pg | 8.23.1 |
| Neon PostgreSQL | pooled `DATABASE_URL` at runtime, direct `DIRECT_URL` for migrations |
| Vercel | Hobby plan |

## Key decisions

- **Prisma 7.10.0, not 8.** The npm `latest` tag points to `8.0.0-rc.22`, a
  release candidate. Addendum A-11 forbids release candidates.
- **Gemini model: `gemini-3.5-flash-lite`.** `gemini-3.8-flash` measured 41-60+
  seconds per call and exceeds the 20 s budget. Read from `GEMINI_MODEL`.
- **69 wilayas**, per Loi 26-06 (4 Apr 2026) and Decret 26-206 (25 May 2026).
- **Delivery fees: office 400/500/600 DA by code, HOME = office + 200.** Demo
  values, explicit because the fee feeds the confirmation hash.
- **Demo store: "Boutique elegance"**, 5 products, low stock (20/12/8/3/25).
- **Catalog shown via `GET /api/catalog`** rather than Prisma directly in the
  page. Importing Prisma into a prerendered page fails the build with an
  unstable-value error under `cacheComponents`.

## Environment variables (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`,
`DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`

All 8 are set in Vercel Production and mirrored in the local `.env`, which is
git-ignored. `.env.example` holds placeholders only.

## Known deviations

- **FAILED AI rows store `content: null`.** Spec 4.1 step 10 implies the
  customer-visible fallback text is persisted. We keep failed rows null so the
  history loader (A-06) cannot pick up an error message as a real reply.
- **`fallbackLanguage` is a heuristic**, not a language classifier. It uses a
  small English word list for the generic error when Gemini failed.
- **Digits-only or signal-free messages fall back to French**, the demo's
  primary language.
- **Catalog is fetched client-side** rather than server-rendered, for the
  `cacheComponents` build reason above. Still database-backed and uncached.
- **The chat response echoes the stored draft** under `__draft` so the scenario
  runner can assert on it. It holds only allowlisted customer-supplied fields
  for that conversation and never `rawAiOutput`.
- **Gemini extracts, the backend decides.** The model may decline an invalid
  option in its own words instead of sending it, so the localized rejection
  template does not always fire; the invalid value is still never stored.
- **Arabic wilaya spellings vary.** `resolveWilaya` retries once with
  alef/ya/teh-marbuta collapsed, so `تيسمسيلت` and `تسمسيلت` both reach 38.

- **Region:** the Vercel project region is set to `fra1` (Frankfurt) to match the
  Neon database in AWS eu-central-1. Confirm with `vercel project inspect`.
- **DEMO_AI_CALLS_PER_HOUR was raised in Vercel for testing; the final value is
  decided on Day 12** (A-10). Lower it before the judging window.
- **Scenario runner:** `node scripts/scenarios.mjs <base-url>` runs the 24-check
  suite. It stops with "cap or quota reached" instead of reporting a budget
  limit as a test failure, and prints how many Gemini calls it made.

## Gotchas found

- Next.js 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route
  segment exports; `maxDuration` is still allowed.
- Prisma 7 needs `prisma.config.ts`, a generator `output`, a driver adapter and
  `dotenv`; it no longer auto-loads `.env`. CHECK constraints are raw SQL.
- PowerShell mangles UTF-8; use a Node `fetch` client for anything with Arabic.
- A free-form `payload` object makes Gemini return `{}`. The nine keys must be
  enumerated and required-but-nullable.

## Commits

`8c3c948` scaffold · `54f66dc` deployed page + SDKs · `7bacd5e` Prisma schema
and first migration · `584c94b` CHECK constraints and seed · `0484235` wilaya
allowlist and fees · `6f076ba` Day 3 Gemini service and `/api/chat` · `587033e`
Day 3 language fixes · `cc3e7c5` Day 4 chat UI · `86b53ae` chat UX and design ·
`3cb9b1a` Day 5 draft extraction and validation

## Next steps

1. **Day 6** — backend-generated order summary, localized, plus the SHA-256
   confirmation hash bound to the exact normalized draft (A-09).
2. **Day 7** — transactional order creation with an atomic stock decrement and
   the single-use confirmation gate.
3. **Day 9-11** — dashboard passcode, confirm/cancel, reset.
4. Replace the dashboard passcode placeholder before judging.