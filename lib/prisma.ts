import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client";

// Runtime client for the running app. Uses the POOLED Neon connection
// (DATABASE_URL). The Prisma CLI uses DIRECT_URL for migrations instead
// - see prisma.config.ts.
//
// A single instance is reused across hot reloads in development so we do not
// exhaust the Neon connection pool.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL as string,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}