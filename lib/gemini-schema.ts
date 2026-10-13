import { z } from "zod";
import { LANGUAGES } from "./templates";

// Request body, spec section 12.1 and 9.1.
// message: trimmed string, 1-500 characters. Unknown fields are rejected.
export const chatRequestSchema = z
  .object({
    conversationId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .describe("null or absent starts a new conversation"),
    message: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .describe("trimmed, 1-500 characters"),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Spec 8.2: every valid model response has exactly this shape.
// strict() rejects unknown top-level, action and payload fields.
export const geminiActionSchema = z
  .object({
    type: z.enum(["NONE", "UPDATE_ORDER_DRAFT", "CANCEL_DRAFT", "CREATE_ORDER"]),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const geminiResponseSchema = z
  .object({
    language: z.enum(LANGUAGES as ["ar", "fr", "en"]),
    reply: z.string().trim().min(1).max(1200),
    action: geminiActionSchema,
  })
  .strict();

export type GeminiResponse = z.infer<typeof geminiResponseSchema>;