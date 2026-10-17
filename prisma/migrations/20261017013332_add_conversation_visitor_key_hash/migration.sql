-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "visitorKeyHash" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_visitorKeyHash_createdAt_idx" ON "Conversation"("visitorKeyHash", "createdAt");
