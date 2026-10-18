import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { chatRequestSchema } from "@/lib/gemini-schema";
import { buildChatContext } from "@/lib/context";
import {
  callGemini,
  PER_ATTEMPT_TIMEOUT_MS,
  RETRY_OVERHEAD_MS,
} from "@/lib/gemini";
import {
  computeMissingFields,
  mergeDraft,
  type CatalogProduct,
  type Draft,
  type FieldError,
} from "@/lib/draft";
import { prepareOrder } from "@/lib/order-summary";
import {
  conversationBelongsToVisitor,
  mintVisitor,
  readVisitor,
  visitorSetCookieHeader,
} from "@/lib/visitor";
import {
  DEFAULT_AI_CALLS_PER_MINUTE,
  geminiReasonFor,
  logEvent,
} from "@/lib/diagnostics";
import {
  dominantScriptIsArabic,
  explicitLanguageRequest,
  replyInLabel,
  replyInstruction,
  resolveReplyLanguage,
  storedLanguage,
} from "@/lib/language";
import {
  createOrderFromConfirmedDraft,
  loadTrustedCatalog,
  OrderCreationError,
} from "@/lib/order-create";
import {
  ADDRESS_NOT_ALLOWED,
  CONFIRMATION_REJECTED,
  CONVERSATION_LIMIT,
  DEMO_BUSY,
  DRAFT_CANCELLED,
  FIELD_LABELS,
  GENERIC_ERROR,
  INVALID_ADDRESS,
  INVALID_NAME,
  INVALID_OPTION_NO_PRODUCT,
  INVALID_PHONE,
  INVALID_QUANTITY,
  INVALID_REQUEST,
  INVALID_SIZE_OR_COLOR,
  MESSAGE_TOO_LONG,
  ORDER_CREATED,
  ORDER_OUT_OF_STOCK,
  PRODUCT_CHANGED,
  PRODUCT_NOT_FOUND,
  QUANTITY_TOO_HIGH,
  UNKNOWN_WILAYA,
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
 * Day 7 spec 10.1 / A-09, wired to the CREATE_ORDER action.
 *
 * Spec 8.4 rule 1: the backend message REPLACES Gemini's reply on both the
 * success and the failure paths, so the customer never sees model text that
 * contradicts what the database actually did.
 *
 * Only the reply, the AI row and the response are handled here. The draft,
 * phase, hash, stock and Orders are owned by lib/order-create.ts.
 */
async function runOrderCreation(args: {
  conversationId: string;
  language: Language;
  aiRowId: string;
  parsed: unknown;
  attempts: number;
  budget: number;
}) {
  const { conversationId, language, aiRowId } = args;

  /** Writes the AI row and returns the API body for one outcome. */
  const respond = async (opts: {
    reply: string;
    orderId: string | null;
    gate: string;
    status: "SUCCEEDED" | "FAILED";
    /** Shown when the draft survived, so the UI state stays truthful. */
    keepDraft: boolean;
  }) => {
    await prisma.message.update({
      where: { id: aiRowId },
      data: {
        content: opts.reply,
        aiCallStatus: opts.status,
        rawAiOutput: {
          parsed: args.parsed,
          resolvedLanguage: language,
          orderResult: opts.gate,
          orderId: opts.orderId,
          attempts: args.attempts,
          budget: args.budget,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { phase: true, orderDraft: true, confirmationHash: true },
    });
    const catalog = await loadTrustedCatalog(
      (await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { businessId: true },
      })).businessId,
    );

    return okJson({
      conversationId,
      reply: opts.reply,
      language,
      phase: conversation?.phase ?? "IDLE",
      missingFields: opts.keepDraft
        ? computeMissingFields((conversation?.orderDraft ?? {}) as Draft, catalog)
        : [],
      orderCreated: opts.orderId !== null,
      limited: false,
      limitReason: null,
      __draft: opts.keepDraft ? ((conversation?.orderDraft ?? {}) as Draft) : {},
      __hash: opts.keepDraft ? conversation?.confirmationHash ?? null : null,
      __gate: opts.gate,
      __orderId: opts.orderId,
    });
  };

  try {
    // NOTE: the optional test-only failure flag is deliberately NOT passed
    // here, so it cannot be reached from the public API.
    const created = await createOrderFromConfirmedDraft({ conversationId, language });

    // Spec 13.2: the backend sends the localized "order created" text.
    return await respond({
      reply: ORDER_CREATED[language],
      orderId: created.orderId,
      gate: "created",
      status: "SUCCEEDED",
      keepDraft: false,
    });
  } catch (e) {
    const err = e instanceof OrderCreationError ? e : null;

    if (err?.kind === "price-changed" && err.summary && err.hash) {
      // A-09: the confirmed numbers moved. Create nothing, show the new ones.
      return await respond({
        reply: err.summary,
        orderId: null,
        gate: "price-changed",
        status: "SUCCEEDED",
        keepDraft: true,
      });
    }

    if (err?.kind === "out-of-stock") {
      // 13.3: never claims success, and the draft is untouched.
      return await respond({
        reply: ORDER_OUT_OF_STOCK[language],
        orderId: null,
        gate: "out-of-stock",
        status: "SUCCEEDED",
        keepDraft: true,
      });
    }

    if (err?.kind === "gate-rejected") {
      return await respond({
        reply: CONFIRMATION_REJECTED[language],
        orderId: null,
        gate: `gate-rejected:${err.detail}`,
        status: "SUCCEEDED",
        keepDraft: true,
      });
    }

    if (err?.kind === "invalid-draft") {
      return await respond({
        reply: GENERIC_ERROR[language],
        orderId: null,
        gate: `invalid-draft:${err.detail}`,
        status: "SUCCEEDED",
        keepDraft: true,
      });
    }

    // Anything else, including the test-only forced failure: 13.8.
    return await respond({
      reply: GENERIC_ERROR[language],
      orderId: null,
      gate: "error",
      status: "FAILED",
      keepDraft: true,
    });
  }
}

/**
 * Every chat response is private and uncacheable. The body can carry the
 * caller's own draft, hash, gate and order id, so it must never be written to a
 * shared cache. `Vary: Cookie` because the answer depends on the visitor cookie.
 */
const CHAT_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Vary: "Cookie",
  Pragma: "no-cache",
};

function okJson(body: unknown) {
  return Response.json(body, { status: 200, headers: CHAT_HEADERS });
}

/**
 * Carries a freshly minted visitor token out of the handler, so the exported
 * POST can attach the Set-Cookie header to whichever response was produced,
 * including the early rejections that never reach Gemini.
 */
type VisitorContext = { visitorToken: string | null };

export async function POST(request: Request) {
  const ctx: VisitorContext = { visitorToken: null };
  const response = await handleChat(request, ctx);
  if (ctx.visitorToken) {
    response.headers.append("Set-Cookie", visitorSetCookieHeader(ctx.visitorToken));
  }
  return response;
}

async function handleChat(request: Request, ctx: VisitorContext) {
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

  // --- A-14: the visitor identity for this request ---
  // A visitor with no cookie gets a brand new one, minted here so it can be set
  // on whatever response is produced. The raw token never leaves this function.
  const existingVisitor = await readVisitor();
  const visitor: { keyHash: string | null; mintedToken: string | null } =
    existingVisitor.keyHash
      ? { keyHash: existingVisitor.keyHash, mintedToken: null }
      : mintVisitor();

  let conversation = inputId
    ? await prisma.conversation.findFirst({
        where: { id: inputId, businessId: business.id },
      })
    : null;

  // A-14: an existing conversation must belong to THIS visitor. A mismatch,
  // including a null stored hash from before the visitor cookie existed, is
  // refused here, BEFORE any Gemini call, with an error that does not reveal
  // whether the conversation exists.
  if (inputId && conversation) {
    if (!conversationBelongsToVisitor(conversation.visitorKeyHash, visitor.keyHash)) {
      return okJson({ ok: false, reply: INVALID_REQUEST.en });
    }
  } else {
    conversation = await prisma.conversation.create({
      data: { businessId: business.id, visitorKeyHash: visitor.keyHash },
    });
  }
  // Handed to the exported POST, which attaches the Set-Cookie header.
  ctx.visitorToken = visitor.mintedToken;

  // --- A-06 sweep: stale PENDING AI rows become FAILED (still counted) ---
  await prisma.message.updateMany({
    where: { senderType: "AI", aiCallStatus: "PENDING", createdAt: { lt: new Date(Date.now() - 60_000) } },
    data: { aiCallStatus: "FAILED" },
  });

  // --- The language the conversation is already being held in ---
  // Read from the last AI row that recorded one, so the choice survives the
  // next turn without guessing from the reply text.
  const lastAssistant = await prisma.message.findFirst({
    where: { conversationId: conversation.id, senderType: "AI" },
    orderBy: { createdAt: "desc" },
    select: { rawAiOutput: true },
  });
  const stored = storedLanguage(lastAssistant?.rawAiOutput ?? null);
  const conversationLanguage = stored.language;
  const conversationLanguageExplicit = stored.explicit;

  // --- Limits: per-conversation, global per-minute and global hourly ---
  // spec 9.1 and A-06/A-10, plus A-15 which adds the per-minute cap.
  // Every cap answers with a friendly localized template and makes no Gemini
  // call, and each has its own reason so logs and tests can tell them apart.
  const maxPerConversation = Number(process.env.DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION ?? 40);
  const maxCallsPerHour = Number(process.env.DEMO_AI_CALLS_PER_HOUR ?? 120);
  const maxCallsPerMinute = Number(process.env.DEMO_AI_CALLS_PER_MINUTE ?? DEFAULT_AI_CALLS_PER_MINUTE);

  const customerMessages = await prisma.message.count({
    where: { conversationId: conversation.id, senderType: "CUSTOMER" },
  });
  if (customerMessages >= maxPerConversation) {
    logEvent({
      event: "chat",
      outcome: "blocked",
      reason: "conversation-cap",
      durationMs: Date.now() - startedAt,
      phase: conversation.phase,
    });
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

  // Failed AI attempts count towards both global caps, exactly as for the
  // hourly one: the Message row is what is counted, whatever the call did.
  const sinceMinuteAgo = new Date(Date.now() - 60_000);
  const [aiCallsLastMinute, aiCallsLastHour] = await Promise.all([
    prisma.message.count({
      where: { senderType: "AI", createdAt: { gte: sinceMinuteAgo } },
    }),
    prisma.message.count({
      where: {
        senderType: "AI",
        createdAt: { gte: new Date(Date.now() - 3_600_000) },
      },
    }),
  ]);

  // A-15: the per-minute cap is checked first, so a burst is stopped in the
  // cheapest place. It exists to protect the Gemini quota during judging.
  if (aiCallsLastMinute >= maxCallsPerMinute) {
    logEvent({
      event: "chat",
      outcome: "blocked",
      reason: "minute-cap",
      durationMs: Date.now() - startedAt,
      phase: conversation.phase,
      aiCallCount: aiCallsLastMinute,
    });
    return okJson({
      conversationId: conversation.id,
      reply: DEMO_BUSY.en,
      phase: conversation.phase,
      missingFields: [],
      orderCreated: false,
      limited: true,
      limitReason: "minute",
    });
  }

  if (aiCallsLastHour >= maxCallsPerHour) {
    logEvent({
      event: "chat",
      outcome: "blocked",
      reason: "hour-cap",
      durationMs: Date.now() - startedAt,
      phase: conversation.phase,
      aiCallCount: aiCallsLastHour,
    });
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
  // The missing-field list sent to the model is computed before the model's own
  // update (addendum A-05). It is recomputed after the merge for the response.
  const currentDraft = (conversation.orderDraft ?? {}) as Draft;
  const context = await buildChatContext(
    prisma,
    business.id,
    conversation.id,
    conversation.phase,
    [],
  );

  // --- Spec 4.1 step 6: AI row created BEFORE the call, as PENDING ---
  const aiRow = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "AI",
      content: null,
      aiCallStatus: "PENDING",
    },
  });

  // --- Load the current draft and compute the missing fields in the backend ---
  const catalogProducts: CatalogProduct[] = context.catalog.map((p) => ({
    id: p.id,
    name: p.name,
    priceDzd: p.priceDzd,
    stockQuantity: p.stockQuantity,
    sizes: p.sizes,
    colors: p.colors,
  }));
  const missingBefore = computeMissingFields(currentDraft, catalogProducts);

  const contextJson = JSON.stringify({
    catalog: context.catalog,
    business: context.business,
    feeTable: context.feeTable,
    deliveryConfig: context.deliveryConfig,
    conversation: { id: conversation.id, draft: currentDraft, missingFields: missingBefore },
    history: context.history,
  });

  // Recorded as a debug aid (A-06). "ar" when the backend decides from script,
  // "model" when the model is left to tell English from French and Darija.
  const replyIn = replyInLabel(message);

  const outcome = await callGemini(message, contextJson, startedAt, replyInstruction(message));

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

    // A-15: one line, no message text and no raw model output.
    logEvent({
      event: "chat",
      outcome: "failed",
      reason: geminiReasonFor(outcome.category),
      durationMs: Date.now() - startedAt,
      language,
      phase: conversation.phase,
      attempts: outcome.attempts,
    });

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

  const language = resolveReplyLanguage({
    modelLanguage: outcome.data.language,
    latest: message,
    conversationLanguage,
    conversationLanguageExplicit,
  });
  // True when the customer named the language in this message, or wrote in
  // Arabic script. Recorded so the next turn can honour a deliberate switch over
  // the model's per-message guess.
  const languageExplicit =
    explicitLanguageRequest(message) !== undefined || dominantScriptIsArabic(message);
  const modelReply = outcome.data.reply.trim();
  const budget = PER_ATTEMPT_TIMEOUT_MS + RETRY_OVERHEAD_MS;

  const action = outcome.data.action;
  let reply = modelReply;
  let draft = currentDraft;
  let phase: string = conversation.phase;

  // --- Day 7: CREATE_ORDER goes through lib/order-create.ts.
  // The backend, not Gemini, decides the outcome and sends the reply. Every
  // failure path keeps the draft intact unless the transaction already
  // consumed it.
  if (action.type === "CREATE_ORDER") {
    const outcome7 = await runOrderCreation({
      conversationId: conversation.id,
      language,
      aiRowId: aiRow.id,
      parsed: outcome.data,
      attempts: outcome.attempts,
      budget,
    });
    return outcome7;
  }

  const finish = async () => {
    const missingFields = computeMissingFields(draft, catalogProducts);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        orderDraft:
          Object.keys(draft).length === 0
            ? Prisma.DbNull
            : (draft as unknown as Prisma.InputJsonValue),
        phase: phase as never,
        // The hash is cleared whenever the draft changed, and set only when a
        // summary is actually issued. A question that changes nothing leaves
        // the stored hash untouched, so it stays valid.
        confirmationHash: conversation.confirmationHash,
      },
    });
    await prisma.message.update({
      where: { id: aiRow.id },
      data: {
        content: reply,
        aiCallStatus: "SUCCEEDED",
        rawAiOutput: {
          parsed: outcome.data,
          resolvedLanguage: language, languageExplicit, replyIn,
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
      phase,
      missingFields,
      orderCreated: false,
      limited: false,
      limitReason: null,
      // Debug-safe echo of the stored draft. It contains only allowlisted
      // customer-supplied fields and never rawAiOutput. Safe for the public
      // endpoint because the draft is scoped to this conversation.
      __draft: draft,
      __hash: conversation.confirmationHash,
    });
  };

  // --- CANCEL_DRAFT: clear the draft and the hash, return to IDLE ---
  if (action.type === "CANCEL_DRAFT") {
    draft = {};
    phase = "IDLE";
    reply = DRAFT_CANCELLED[language];
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        orderDraft: Prisma.DbNull,
        confirmationHash: null,
        phase: "IDLE",
      },
    });
    await prisma.message.update({
      where: { id: aiRow.id },
      data: {
        content: reply,
        aiCallStatus: "SUCCEEDED",
        rawAiOutput: { parsed: outcome.data, resolvedLanguage: language, languageExplicit, replyIn, attempts: outcome.attempts, budget } as unknown as Prisma.InputJsonValue,
      },
    });
    return okJson({
      conversationId: conversation.id,
      reply,
      language,
      phase: "IDLE",
      // The draft was cleared, so the backend now considers productId missing
      // again. Recomputed from an empty draft rather than hardcoded.
      missingFields: computeMissingFields({}, catalogProducts),
      orderCreated: false,
      limited: false,
      limitReason: null,
      __draft: {},
      // CANCEL_DRAFT clears the stored hash along with the draft.
      __hash: null,
    });
  }

  // --- UPDATE_ORDER_DRAFT: validate every field against trusted data ---
  if (action.type === "UPDATE_ORDER_DRAFT") {
    // Strip nulls so the merge only sees fields the customer actually stated.
    const stated: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(action.payload)) {
      if (value !== null && value !== undefined && value !== "") {
        stated[key] = value;
      }
    }
    const merged = mergeDraft(currentDraft, stated, catalogProducts);
    draft = merged.draft;
    phase = "ORDER_COLLECTION";

    const selected =
      catalogProducts.find((p) => p.id === draft.productId) ?? null;

    if (merged.errors.length > 0) {
      // Spec 8.4: the backend message REPLACES the model reply.
      reply = rejectionTemplate(merged.errors[0].reason, language, selected);
    } else if (merged.productChangedAndCleared) {
      // A-04 + A-08 template 13.11.
      const missingLabels = computeMissingFields(draft, catalogProducts)
        .map((f) => FIELD_LABELS[language][f] ?? f)
        .join(language === "ar" ? "، " : ", ");
      reply = PRODUCT_CHANGED[language].replace(
        "{product}",
        selected?.name ?? "",
      ).replace("{missingList}", missingLabels);
    }

    // --- Day 6 summary, hash and state transition.
    // Spec 8.4 rule 1: a rejection owns the reply, so a rejected turn never
    // also produces a summary.
    if (merged.errors.length > 0) {
      // The turn left AWAITING_CONFIRMATION, so any stored hash is stale by
      // construction. Clearing it keeps the database free of a confirmation
      // that the customer can no longer see a summary for.
      conversation.confirmationHash = null;
    } else {
      // Any accepted order-relevant change invalidates the old hash immediately
      // (section 17 Day 6). Comparing canonical drafts means a pure question
      // that changes nothing leaves both the phase and the hash alone.
      if (!sameDraft(currentDraft, draft)) conversation.confirmationHash = null;

      // A complete draft produces the trusted summary, a fresh hash and
      // AWAITING_CONFIRMATION. The backend summary replaces the model's reply.
      const prepared = prepareOrder(draft, catalogProducts, language);
      if (prepared.ok) {
        phase = "AWAITING_CONFIRMATION";
        conversation.confirmationHash = prepared.order.hash;
        reply = prepared.order.summary;
      } else if (prepared.blocked === "quantity-too-high-stock") {
        // Refuse the summary with the existing stock template. Stock itself is
        // not touched; only the summary and the hash are withheld.
        phase = "ORDER_COLLECTION";
        conversation.confirmationHash = null;
        reply = QUANTITY_TOO_HIGH[language].replace(
          "{stockQuantity}",
          String(
            catalogProducts.find((p) => p.id === draft.productId)?.stockQuantity ??
              0,
          ),
        );
      } else if (prepared.blocked === "unknown-fee") {
        // No trusted fee means no summary and no hash (A-09).
        phase = "ORDER_COLLECTION";
        conversation.confirmationHash = null;
        reply = GENERIC_ERROR[language];
      }
    }
  }

  // finish() persists the draft, the phase, the hash and the reply, and echoes
  // the resulting state for the scenario runner.
  return finish();
}

/**
 * True when two drafts carry identical order-relevant values. The key order is
 * fixed so the comparison does not depend on how the draft was built. This is
 * the only definition of "the order changed" used by the route.
 */
function sameDraft(a: Draft, b: Draft): boolean {
  const pick = (d: Draft) => ({
    productId: d.productId ?? null,
    quantity: d.quantity ?? null,
    size: d.size ?? null,
    color: d.color ?? null,
    customerName: d.customerName ?? null,
    customerPhone: d.customerPhone ?? null,
    deliveryMethod: d.deliveryMethod ?? null,
    wilaya: d.wilaya ?? null,
    deliveryAddress: d.deliveryAddress ?? null,
  });
  return JSON.stringify(pick(a)) === JSON.stringify(pick(b));
}

/** A-08: a localized list of the selected product's real options. */
function availableOptionsLabel(language: Language, product: CatalogProduct | null): string {
  if (!product) return "";
  const joiner = language === "ar" ? "، " : ", ";
  const parts: string[] = [];
  if (product.sizes.length > 0) {
    parts.push(
      `${FIELD_LABELS[language].size}: ${product.sizes.join(joiner)}`,
    );
  }
  if (product.colors.length > 0) {
    parts.push(
      `${FIELD_LABELS[language].color}: ${product.colors.join(joiner)}`,
    );
  }
  return parts.join(language === "ar" ? " / " : " / ");
}

/**
 * Spec 8.4 rule 1 and A-08: when the backend rejects a field it replaces the
 * model's reply entirely with the matching localized template. The first
 * rejection wins so the customer sees one clear correction, not a pile of them.
 */
function rejectionTemplate(
  reason: FieldError,
  language: Language,
  product: CatalogProduct | null,
): string {
  switch (reason) {
    case "invalid-size":
    case "invalid-color":
      return product
        ? INVALID_SIZE_OR_COLOR[language].replace(
            "{availableOptions}",
            availableOptionsLabel(language, product),
          )
        : INVALID_OPTION_NO_PRODUCT[language];
    case "invalid-quantity":
      return INVALID_QUANTITY[language];
    case "quantity-too-high":
      return QUANTITY_TOO_HIGH[language].replace(
        "{stockQuantity}",
        String(product?.stockQuantity ?? 0),
      );
    case "invalid-name":
      return INVALID_NAME[language];
    case "invalid-phone":
      return INVALID_PHONE[language];
    case "unknown-wilaya":
      return UNKNOWN_WILAYA[language];
    case "invalid-address":
      return INVALID_ADDRESS[language];
    case "address-not-allowed":
      return ADDRESS_NOT_ALLOWED[language];
    case "product-not-found":
      return PRODUCT_NOT_FOUND[language];
    default:
      return GENERIC_ERROR[language];
  }
}