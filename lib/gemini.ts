// Server-only Gemini client (spec 8.1).
//
// Addendum A-03: export maxDuration = 60 from the route, choose the
// per-attempt timeout T so that 2 x T + 5s <= maxDuration, and only perform
// the single retry when at least one full T still remains in the budget.

import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "./system-prompt";
import { geminiResponseSchema, type GeminiResponse } from "./gemini-schema";

/** Worst case: 20s + 20s + 5s = 45s, inside the 60s function budget. */
export const PER_ATTEMPT_TIMEOUT_MS = 20_000;
/** Slack for context building and database writes. */
export const RETRY_OVERHEAD_MS = 5_000;

export type GeminiOutcome =
  | { ok: true; data: GeminiResponse; rawText: string; attempts: number }
  | {
      ok: false;
      category: "quota" | "timeout" | "auth" | "invalid-output" | "unknown";
      rawText: string | null;
      attempts: number;
    };

function classify(err: unknown): "quota" | "timeout" | "auth" | "invalid-output" | "unknown" {
  const e = (err ?? {}) as {
    status?: number;
    code?: number | string;
    name?: string;
    message?: string;
  };
  const status = typeof e.status === "number" ? e.status : undefined;
  const name = (e.name ?? "").toLowerCase();
  const msg = (e.message ?? "").toLowerCase();

  if (
    status === 429 ||
    e.code === 429 ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  ) {
    return "quota";
  }
  if (
    name === "aborterror" ||
    name === "timeouterror" ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "timeout";
  }
  if (
    status === 401 ||
    status === 403 ||
    msg.includes("api key not valid") ||
    msg.includes("permission denied") ||
    msg.includes("unauthenticated") ||
    msg.includes("unauthorized")
  ) {
    return "auth";
  }
  return "unknown";
}

const PAYLOAD_KEYS = [
  "productId",
  "quantity",
  "size",
  "color",
  "customerName",
  "customerPhone",
  "deliveryMethod",
  "wilaya",
  "deliveryAddress",
] as const;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  // Extraction first, wording second: the model fills the draft keys before it
  // composes the reply.
  propertyOrdering: ["action", "language", "reply"],
  properties: {
    // Every allowlisted key is REQUIRED but NULLABLE. null means "the customer
    // did not mention this in the latest message", which the backend treats as
    // "not provided" and simply skips.
    action: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["NONE", "UPDATE_ORDER_DRAFT", "CANCEL_DRAFT", "CREATE_ORDER"],
        },
        // Spec 8.3: the payload may only carry allowlisted order fields, and
        // a free-form object makes the model return an empty payload. The
        // schema therefore enumerates every permitted key explicitly.
        payload: {
          type: Type.OBJECT,
          properties: Object.fromEntries(
            PAYLOAD_KEYS.map((key) => [
              key,
              key === "quantity"
                ? { type: Type.INTEGER, nullable: true }
                : { type: Type.STRING, nullable: true },
            ]),
          ),
          required: [...PAYLOAD_KEYS],
        },
      },
      required: ["type", "payload"],
    },
    language: {
      type: Type.STRING,
      enum: ["ar", "fr", "en"],
      description: "Language of the reply text.",
    },
    reply: {
      type: Type.STRING,
      description: "Short customer-facing reply, 1 to 3 sentences.",
    },
  },
  required: ["action", "language", "reply"],
} as const;

/**
 * Makes at most two attempts. The retry only happens when a full
 * PER_ATTEMPT_TIMEOUT_MS still fits in the remaining budget (A-03).
 */
/**
 * TEST-ONLY injection point (addendum Day 11 / A-15).
 *
 * An explicit function parameter, never an environment variable and never a
 * route argument, so no request can select it. It exists so the failure paths
 * can be exercised offline against the real `callGemini` control flow, without
 * a network call and without a real quota.
 */
export type GeminiClient = (
  prompt: string,
  attempt: number,
  abortSignal: AbortSignal,
) => Promise<string>;

export type GeminiCallOptions = {
  /** Test-only. When set, replaces the provider call entirely. */
  __testClient?: GeminiClient;
};

export async function callGemini(
  latestCustomerMessage: string,
  contextJson: string,
  requestStartedAt: number,
  replyInstruction: string,
  options: GeminiCallOptions = {},
): Promise<GeminiOutcome> {
  const testClient = options.__testClient;
  // With a test client the real credentials are neither read nor needed, so a
  // missing key must not short-circuit before the injection is exercised.
  if (!testClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, category: "auth", rawText: null, attempts: 0 };
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!testClient && !model) {
    return { ok: false, category: "unknown", rawText: null, attempts: 0 };
  }

  const ai = testClient ? null : new GoogleGenAI({ apiKey: apiKey as string });
  let attempts = 0;
  let lastCategory: "quota" | "timeout" | "auth" | "invalid-output" | "unknown" = "unknown";
  let lastRaw: string | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    // A-03: only retry when at least one full T remains.
    const elapsed = Date.now() - requestStartedAt;
    const remaining = PER_ATTEMPT_TIMEOUT_MS + RETRY_OVERHEAD_MS - elapsed;
    if (attempt > 0 && remaining < PER_ATTEMPT_TIMEOUT_MS) break;

    attempts += 1;

    try {
      const prompt = `CONTEXT (JSON):\n${contextJson}\n\nCUSTOMER MESSAGE:\n${latestCustomerMessage}\n\n${replyInstruction}`;
      const abortSignal = AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS);

      // The test client returns the raw text the provider would have produced,
      // so parsing and classification below are exercised unchanged.
      const text = testClient
        ? await testClient(prompt, attempt, abortSignal)
        : (
            await (ai as NonNullable<typeof ai>).models.generateContent({
              model: model as string,
              contents: prompt,
              config: {
                systemInstruction: SYSTEM_PROMPT,
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: RESPONSE_SCHEMA,
                abortSignal,
              },
            })
          ).text ?? "";
      lastRaw = text;

      const parsed = geminiResponseSchema.safeParse(safeJson(text));
      if (parsed.success) {
        return { ok: true, data: parsed.data, rawText: text, attempts };
      }

      lastCategory = "invalid-output";
    } catch (err) {
      lastCategory = classify(err);
      // A quota error will not fix itself on an immediate retry.
      if (lastCategory === "quota" || lastCategory === "auth") break;
    }
  }

  return { ok: false, category: lastCategory, rawText: lastRaw, attempts };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}