import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { chatRequestSchema } from "@/lib/gemini-schema";
import { buildChatContext } from "@/lib/context";
import {
  callGemini,
  PER_ATTEMPT_TIMEOUT_MS,
  RETRY_OVERHEAD_MS,
} from "@/lib/gemini";
import {
  CONVERSATION_LIMIT,
  DEMO_BUSY,
  GENERIC_ERROR,
  INVALID_REQUEST,
  MESSAGE_TOO_LONG,
  type Language,
} from "@/lib/templates";

// Addendum A-03: the Hobby plan allows 300s, but the addendum caps us at 60.
// maxDuration is still a supported route segment config with Cache Components
// enabled; only dynamic, dynamicParams, revalidate and fetchCache were removed.
export const maxDuration = 60;

const MAX_BODY_BYTES = 4_096;

const hasArabicScript = (text: string) => /[\u0600-\u06ff]/.test(text);

// Spec 8.2 fallback: validate the model's language, and if it is absent or
// invalid use a deterministic rule based on the latest message's script.
function fallbackLanguage(latest: string): Language {
  return hasArabicScript(latest) ? "ar" : "fr";
}

/**
 * Spec 8.2 rule 1: "Arabic script, including Darija written in Arabic script"
 * is ar, and for mixed Arabic/French the dominant script wins. The model
 * sometimes returns "fr" for a message written in Arabic script, which would
 * produce a visibly wrong demo, so the script evidence is applied first.
 */
function resolveLanguage(modelValue: string | undefined, latest: string): Language {
  if (hasArabicScript(latest)) return "ar";
  return geminiLanguage(modelValue ?? "") ?? "fr";
}

function okJson(body: unknown) {
  return Response.json(body, { status: 200 });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // --- Parse and validate the request body (spec 9.1) ---
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return okJson({ ok: false, reply: INVALID_REQUEST.en });
    }
    body = JSON.parse(text);
  } catch {
    return okJson({ ok: false, reply: INVALID_REQUEST.en });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const tooLong =
      typeof (body as { message?: unknown })?.message === "string" &&
      (body as { message: string }).message.trim().length > 500;
    return okJson({ ok: false, reply: (tooLong ? MESSAGE_TOO_LONG : INVALID_REQUEST).en });
  }

  const { conversationId: inputId, message } = parsed.data;

  // --- Resolve the conversation (spec 4.1 step 2) ---
  const business = await prisma.business.findFirst();
  if (!business) {
    return okJson({ ok: false, reply: GENERIC_ERROR.en });
  }

  let conversation = inputId
    ? await prisma.conversation.findFirst({
        where: { id: inputId, businessId: business.id },
      })
    : null;

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { businessId: business.id },
    });
  }

  // --- A-06 sweep: stale PENDING AI rows become FAILED (still counted) ---
  await prisma.message.updateMany({
    where: { senderType: "AI", aiCallStatus: "PENDING", createdAt: { lt: new Date(Date.now() - 60_000) } },
    data: { aiCallStatus: "FAILED" },
  });

  // --- Limits: per-conversation and global hourly (spec 9.1, A-06/A-10) ---
  const maxPerConversation = Number(process.env.DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION ?? 40);
  const maxCallsPerHour = Number(process.env.DEMO_AI_CALLS_PER_HOUR ?? 120);

  const customerMessages = await prisma.message.count({
    where: { conversationId: conversation.id, senderType: "CUSTOMER" },
  });
  if (customerMessages >= maxPerConversation) {
    return okJson({
      conversationId: conversation.id,
      reply: CONVERSATION_LIMIT.en,
      phase: conversation.phase,
      missingFields: [],
      orderCreated: false,
      limited: true,
    });
  }

  // Failed AI attempts count towards the cap.
  const aiCallsLastHour = await prisma.message.count({
    where: {
      senderType: "AI",
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  });
  if (aiCallsLastHour >= maxCallsPerHour) {
    return okJson({
      conversationId: conversation.id,
      reply: DEMO_BUSY.en,
      phase: conversation.phase,
      missingFields: [],
      orderCreated: false,
      limited: true,
    });
  }

  // --- Spec 4.1 step 4: save the customer message ---
  await prisma.message.create({
    data: { conversationId: conversation.id, senderType: "CUSTOMER", content: message },
  });

  // --- Spec 4.1 step 5: context, catalog and stock read fresh each time ---
  const context = await buildChatContext(prisma, business.id, conversation.id);

  // --- Spec 4.1 step 6: AI row created BEFORE the call, as PENDING ---
  const aiRow = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "AI",
      content: null,
      aiCallStatus: "PENDING",
    },
  });

  const outcome = await callGemini(
    message,
    JSON.stringify({
      catalog: context.catalog,
      business: context.business,
      deliveryConfig: context.deliveryConfig,
      conversation: context.conversation,
      history: context.history,
    }),
    startedAt,
  );

  // --- Spec 4.1 steps 9-10: persist the outcome, return safe UI state ---
  if (!outcome.ok) {
    // rawAiOutput is kept for debugging only and never returned to the client.
    await prisma.message.update({
      where: { id: aiRow.id },
      data: {
        content: null,
        aiCallStatus: "FAILED",
        rawAiOutput: outcome.rawText
          ? { failedCategory: outcome.category, raw: outcome.rawText }
          : { failedCategory: outcome.category },
      },
    });

    const language = fallbackLanguage(message);
    const reply =
      outcome.category === "quota" ? DEMO_BUSY[language] : GENERIC_ERROR[language];

    return okJson({
      conversationId: conversation.id,
      reply,
      phase: conversation.phase,
      missingFields: [],
      orderCreated: false,
      limited: false,
    });
  }

  const language = resolveLanguage(outcome.data.language, message);
  const reply = outcome.data.reply.trim();
  const budget = PER_ATTEMPT_TIMEOUT_MS + RETRY_OVERHEAD_MS;

  await prisma.message.update({
    where: { id: aiRow.id },
    data: {
      content: reply,
      aiCallStatus: "SUCCEEDED",
      rawAiOutput: {
        parsed: outcome.data,
        attempts: outcome.attempts,
        budget,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return okJson({
    conversationId: conversation.id,
    reply,
    // Safe UI state: the chat UI needs the language to render localized labels.
    language,
    phase: conversation.phase,
    missingFields: [],
    orderCreated: false,
    limited: false,
  });
}

function geminiLanguage(value: string): Language | null {
  return value === "ar" || value === "fr" || value === "en" ? value : null;
}