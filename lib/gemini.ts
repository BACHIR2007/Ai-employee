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

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    language: {
      type: Type.STRING,
      enum: ["ar", "fr", "en"],
      description: "Language of the reply text.",
    },
    reply: {
      type: Type.STRING,
      description: "Short customer-facing reply, 1 to 3 sentences.",
    },
    action: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["NONE", "UPDATE_ORDER_DRAFT", "CANCEL_DRAFT", "CREATE_ORDER"],
        },
        payload: { type: Type.OBJECT, additionalProperties: true },
      },
      required: ["type", "payload"],
    },
  },
  required: ["language", "reply", "action"],
} as const;

/**
 * Makes at most two attempts. The retry only happens when a full
 * PER_ATTEMPT_TIMEOUT_MS still fits in the remaining budget (A-03).
 */
export async function callGemini(
  latestCustomerMessage: string,
  contextJson: string,
  requestStartedAt: number,
): Promise<GeminiOutcome> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;

  if (!apiKey) {
    return { ok: false, category: "auth", rawText: null, attempts: 0 };
  }
  if (!model) {
    return { ok: false, category: "unknown", rawText: null, attempts: 0 };
  }

  const ai = new GoogleGenAI({ apiKey });
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
      const response = await ai.models.generateContent({
        model,
        contents: `CONTEXT (JSON):\n${contextJson}\n\nCUSTOMER MESSAGE:\n${latestCustomerMessage}`,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          abortSignal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
        },
      });

      const text = response.text ?? "";
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