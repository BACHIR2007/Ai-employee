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

/**
 * Minimal deterministic English-versus-not-English signal, used ONLY for the
 * generic error fallback when Gemini failed and there is no model language to
 * trust (spec 13.6).
 *
 * Both French and Latin-script Darija map to fr, so the only distinction that
 * matters is "is this English". The list holds common English function and
 * catalogue words that are not also ordinary French or Darija words. Words
 * that exist in both languages (for example "prix", "merci", and the French
 * pronoun "me") are deliberately excluded so they cannot cause a false "en".
 */
const ENGLISH_MARKERS = new Set([
  "the", "is", "are", "what", "how", "much", "many", "price", "do", "you",
  "have", "has", "can", "want", "need", "please", "thanks", "hello", "this",
  "that", "of", "for", "in", "and", "with", "stock", "available", "size",
  "color", "colour", "buy", "order", "deliver",
]);

function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some((word) => ENGLISH_MARKERS.has(word));
}

/**
 * Spec 13.6: when the model gives no usable language, infer it from the latest
 * customer message. Arabic-dominant text is ar; English is en; everything else
 * - French and Latin-script Darija alike - is fr.
 *
 * A message with no usable signal at all (digits only, for example) falls back
 * to fr, which is the demo's primary language. This is a documented default,
 * not a claim of perfect detection.
 */
function fallbackLanguage(latest: string): Language {
  if (dominantScriptIsArabic(latest)) return "ar";
  return looksEnglish(latest) ? "en" : "fr";
}

/**
 * Spec 8.2: "for unclear mixed Arabic/French, prefer the dominant script".
 * Counts Arabic-script vs Latin letters so a mostly-English message that
 * merely contains one Arabic word is not forced to Arabic.
 */
function dominantScriptIsArabic(text: string): boolean {
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0600 && code <= 0x06ff) arabic += 1;
    else if (
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x61 && code <= 0x7a) // a-z
    ) {
      latin += 1;
    }
  }
  return arabic > 0 && arabic >= latin;
}

/**
 * Spec 8.2 rule 1: "Arabic script, including Darija written in Arabic script"
 * is ar. Gemini sometimes returns "fr" for a message written in Arabic script,
 * so script evidence is applied before the model's own label.
 */
function resolveLanguage(modelValue: string | undefined, latest: string): Language {
  if (dominantScriptIsArabic(latest)) return "ar";
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
      limitReason: "conversation",
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
      limitReason: "hourly",
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
      limitReason: null,
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
    limitReason: null,
  });
}

function geminiLanguage(value: string): Language | null {
  return value === "ar" || value === "fr" || value === "en" ? value : null;
}