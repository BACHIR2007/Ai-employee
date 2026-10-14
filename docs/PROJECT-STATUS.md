# AI Employee — Project Status

Updated: 15 October 2026 (end of Day 4)

## Current state

Days 1-4 of 14 complete. The app deploys to Vercel, reads and writes Neon
PostgreSQL through Prisma, answers product questions in Arabic, French and
English, and has a working chat page at `/`. No order drafting, no confirmation
gate, no dashboard yet.

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

## Gotchas found

- Next.js 16 `cacheComponents` **rejects** the `dynamic` and `runtime` route
  segment exports; data is dynamic by default. `maxDuration` is still allowed.
- Prisma 7 needs `prisma.config.ts` at the project root, `output` on the
  generator, a driver adapter, and `dotenv`; it no longer auto-loads `.env`.
- Prisma cannot express CHECK constraints; they are raw SQL in migrations.
- `migrate dev --create-only` produces an empty migration when the only change
  is raw SQL, so the SQL is authored by hand into that new folder.
- PowerShell mangles UTF-8 in the console and in `Invoke-RestMethod`. Use a
  Node `fetch` client for anything containing Arabic.
- Gemini mislabels Arabic-script messages as French; the backend applies a
  deterministic dominant-script rule (spec 8.2).
- Neon compute sleeps, so the first query after idle can be slow.

## Commits

`8c3c948` scaffold · `33328cc` .env.example and README · `54f66dc` deployed
home page + pg/Gemini SDKs · `567d466` gitignore fix · `7bacd5e` Prisma schema
and first migration · `584c94b` CHECK constraints and seed · `0484235` wilaya
allowlist, fees and Order constraints · `6f076ba` Day 3 Gemini service and
`/api/chat` · `587033e` Day 3 fixes (language, wilaya 68)

## Next steps

1. **Day 5** — order draft state, field validation, missing-field logic.
2. **Day 6-7** — summary, confirmation hash, transactional order creation.
3. **Day 9-11** — dashboard passcode, confirm/cancel, reset.
4. Replace the dashboard passcode placeholder before judging.