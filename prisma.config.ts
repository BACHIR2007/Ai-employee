import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 keeps all CLI configuration here instead of in schema.prisma.
// Per addendum A-11 and the project rule, migrations run against the Neon
// DIRECT connection (DIRECT_URL), while the running Next.js app uses the
// pooled DATABASE_URL through the Neon driver adapter.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});