# AI Employee — Project Status

Updated: 14 October 2026 (end of Day 3)

## Current state

Days 1-3 of 14 complete. The app deploys to Vercel, reads and writes Neon
PostgreSQL through Prisma, and answers product questions in Arabic, French and
English. No order drafting, no confirmation gate, no dashboard, no chat UI yet.

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
- **Gemini model: `gemini-3.5-flash-lite`.** `gemini-3.8-flash` was measured at
  41-60+ seconds per call and would exceed the 20 s budget; the Flash-Lite model
  answers in about 1.2-1.9 s. Model name comes from `GEMINI_MODEL`, never
  hardcoded.
- **69 wilayas.** Law 26-06 (4 Apr 2026) and Decree 26-206 (25 May 2026). Owner
  approved the 69 list over the legacy 58 list. Source noted in `lib/wilayas.ts`.
- **Delivery fees: office 400/500/600 DA by wilaya code, HOME = office + 200.**
  Demo values, written out explicitly because the fee is part of the
  confirmation hash.
- **Demo store: "Boutique elegance"**, 5 products, deliberately low stock
  (20/12/8/3/25) so out-of-stock paths are easy to demo.

## Environment variables (names only, never values)

`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`DASHBOARD_PASSCODE`, `SESSION_SECRET`, `DEMO_AI_CALLS_PER_HOUR`,
`DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION`

All 8 are set in Vercel Production and mirrored in the local `.env`, which is
git-ignored. `.env.example` holds placeholders only.

## Gotchas found

- Next.js 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route
  segment exports; data is dynamic by default. `maxDuration` is still allowed.
- Prisma 7 needs `prisma.config.ts` at the project root, `output` on the
  generator, a driver adapter, and `dotenv`; it no longer auto-loads `.env`.
- Prisma cannot express CHECK constraints; they are raw SQL in migrations.
- `migrate dev --create-only` produces an empty migration when the only change
  is raw SQL, so the SQL is authored by hand into that new folder.
- PowerShell mangles UTF-8 in the console (`à` shows as `Ã`). The database is
  correct; verify with a script, not the console.
- Gemini mislabels Arabic-script messages as French; the backend now applies a
  deterministic script rule (spec 8.2).
- Neon compute sleeps, so the first query after idle can be slow.

## Commits

`8c3c948` scaffold · `33328cc` .env.example and README · `54f66dc` deployed
home page + pg/Gemini SDKs · `567d466` gitignore fix · `7bacd5e` Prisma schema
and first migration · `584c94b` CHECK constraints and seed · `0484235` wilaya
allowlist, fees and Order constraints

## Next steps

1. **Day 4** — chat UI end to end on the deployed URL.
2. **Day 5-6** — order draft, field validation, summary and confirmation hash.
3. **Day 7** — transactional order creation with atomic stock decrement.
4. **Day 9-11** — dashboard passcode, confirm/cancel, reset.
5. Move the dashboard passcode to the real environment value before judging.