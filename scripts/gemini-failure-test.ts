// TEMPORARY Day 8 failure test: Gemini fails while the conversation is
// AWAITING_CONFIRMATION. Deleted after use. 1 Gemini call.
//
// Run with a process-level GEMINI_MODEL that points at a model that does not
// exist, so the call fails after the draft and hash are already stored. .env is
// never read, printed or modified for this.
import "dotenv/config";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../generated/prisma/client";

const BASE = "http://localhost:4200";
const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DIRECT_URL as string }),
});

async function chat(conversationId: string | null, message: string) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ conversationId, message }),
  });
  return { ...(await res.json()), _status: res.status };
}

const orderMessage =
  `I want the T-shirt coton bio, size L, color Noir, quantity 2 for Test Client, ` +
  `phone 0550123456, delivery to office, wilaya Tissemsilt`;

async function conversationState(id: string) {
  const c = await prisma.conversation.findUniqueOrThrow({
    where: { id },
    select: { phase: true, confirmationHash: true, orderDraft: true },
  });
  return {
    phase: c.phase,
    hash: c.confirmationHash,
    draft: c.orderDraft,
  };
}

async function main() {
  const orderCountBefore = await prisma.order.count();

  // 1. Reach a summary with a real model, so the draft and hash are stored.
  const first = await chat(null, orderMessage);
  const before = await conversationState(first.conversationId);
  console.log("--- before the failure ---");
  console.log(`  phase=${before.phase} hash=${before.hash ? "set" : "none"}`);
  console.log(`  reply starts: ${String(first.reply).slice(0, 60)}`);

  if (before.phase !== "AWAITING_CONFIRMATION" || !before.hash) {
    console.error("SETUP FAILED: no summary was reached, so the test proves nothing");
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2. Confirm with a broken model. One call, expected to fail.
  process.env.GEMINI_MODEL = "gemini-does-not-exist-day8";
  const failed = await chat(first.conversationId, "yes, I confirm");

  const after = await conversationState(first.conversationId);
  const orderCountAfter = await prisma.order.count();

  console.log("\n--- after the Gemini failure ---");
  console.log(`  HTTP status           ${failed._status}`);
  console.log(`  reply                 ${failed.reply}`);
  console.log(`  language              ${failed.language ?? "(none)"}`);
  console.log(`  limited / limitReason ${failed.limited} / ${failed.limitReason ?? "(none)"}`);
  console.log(`  phase                 ${after.phase}  (was ${before.phase})`);
  console.log(`  hash preserved        ${after.hash === before.hash}`);
  console.log(`  draft preserved       ${JSON.stringify(after.draft) === JSON.stringify(before.draft)}`);
  console.log(`  orders ${orderCountBefore} -> ${orderCountAfter}`);

  // The generic error must be localized and must not claim anything happened.
  const { GENERIC_ERROR } = await import("../lib/templates.ts");
  const lang = failed.language ?? "fr";
  const isGeneric = failed.reply.trim() === GENERIC_ERROR[lang]?.trim();
  const noClaim = !/(created|enregistr|créée|passée|تم)/i.test(failed.reply);

  console.log(`\n  localized generic error (${lang}): ${isGeneric}`);
  console.log(`  makes no success claim: ${noClaim}`);

  const pass =
    isGeneric &&
    noClaim &&
    after.phase === "AWAITING_CONFIRMATION" &&
    after.hash === before.hash &&
    JSON.stringify(after.draft) === JSON.stringify(before.draft) &&
    orderCountAfter === orderCountBefore;

  console.log(`\nRESULT: ${pass ? "PASS" : "FAIL"}`);
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("runner failed:", e?.message ?? e);
  process.exit(1);
});