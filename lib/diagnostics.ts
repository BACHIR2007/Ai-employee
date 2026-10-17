// Concise server-side diagnostics (spec Day 11).
//
// One allowlisted field list, one formatting function, one logger. Anything not
// on the list is dropped before the value is even stringified, so a new call
// site cannot leak customer data by accident.
//
// NEVER logged: message text, customer names, phones, addresses, order contents,
// cookies, visitor tokens, passcodes, session tokens, raw model output, or a
// stack trace that carries any of those. The allowlist is the mechanism, not a
// convention people are asked to remember.

export type LogOutcome = "ok" | "blocked" | "failed";

/**
 * The complete set of fields a log line may carry. Order is the printed order.
 */
const ALLOWED_FIELDS = [
  "event",
  "outcome",
  "reason",
  "durationMs",
  "language",
  "phase",
  "conversationCount",
  "messageCount",
  "aiCallCount",
  "orderCount",
  "attempts",
  "category",
] as const;

export type LogField = (typeof ALLOWED_FIELDS)[number];
export type LogFields = Partial<Record<LogField, string | number | boolean | null | undefined>>;

/** Reasons are a fixed vocabulary, so a typo cannot invent a new one. */
export type LogReason =
  | "minute-cap"
  | "hour-cap"
  | "conversation-cap"
  | "gemini-quota"
  | "gemini-timeout"
  | "gemini-invalid-output"
  | "gemini-auth"
  | "gemini-network"
  | "gate-rejected"
  | "price-changed"
  | "out-of-stock"
  | "created"
  | "reset";

const ALLOWED_REASONS = new Set<string>([
  "minute-cap",
  "hour-cap",
  "conversation-cap",
  "gemini-quota",
  "gemini-timeout",
  "gemini-invalid-output",
  "gemini-auth",
  "gemini-network",
  "gate-rejected",
  "price-changed",
  "out-of-stock",
  "created",
  "reset",
]);

const ALLOWED_OUTCOMES = new Set<string>(["ok", "blocked", "failed"]);

/**
 * Event names are a fixed vocabulary too. Without this, `event` would fall
 * through to safeValue, which only accepts the reason list, and every event
 * name would print as "-".
 */
const ALLOWED_EVENTS = new Set<string>(["chat", "reset", "order", "limits"]);

/** Anything not on the allowlist is coerced away rather than printed. */
function safeValue(value: string | number | boolean | null | undefined): string | number | boolean {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isFinite(value) ? value : "-";
  if (typeof value === "boolean") return value;
  // Strings: only the fixed vocabulary is ever printed verbatim. Every other
  // string is refused, which is what makes this safe for free-form fields.
  if (value.length <= 64 && ALLOWED_REASONS.has(value)) return value;
  return "-";
}

/**
 * Builds the single log line. Pure, so a test can assert on the string without
 * capturing console output.
 */
export function formatLog(fields: LogFields): string {
  const parts: string[] = [];
  for (const key of ALLOWED_FIELDS) {
    if (!(key in fields)) continue;
    const raw = fields[key];
    if (raw === undefined) continue;
    if (key === "reason") {
      if (raw === null) {
        parts.push(`${key}=-`);
        continue;
      }
      const reason = String(raw);
      parts.push(`${key}=${ALLOWED_REASONS.has(reason) ? reason : "unknown"}`);
      continue;
    }
    if (key === "outcome") {
      parts.push(`outcome=${ALLOWED_OUTCOMES.has(String(raw)) ? String(raw) : "unknown"}`);
      continue;
    }
    if (key === "event") {
      parts.push(`event=${ALLOWED_EVENTS.has(String(raw)) ? String(raw) : "unknown"}`);
      continue;
    }
    parts.push(`${key}=${safeValue(raw)}`);
  }
  return `[demo] ${parts.join(" ")}`;
}

/**
 * A-15: the default per-minute global AI-call cap, used when
 * DEMO_AI_CALLS_PER_MINUTE is unset. A code default, so the demo stays
 * protected even when the variable is never configured.
 */
export const DEFAULT_AI_CALLS_PER_MINUTE = 12;

/**
 * Writes one line to the server log. Never throws, because a logging fault
 * must never become a customer-visible error.
 */
export function logEvent(fields: LogFields): void {
  try {
    console.info(formatLog(fields));
  } catch {
    /* logging must never break a request */
  }
}

/** The distinct internal reason for a Gemini failure category (A-15). */
export function geminiReasonFor(
  category: "quota" | "timeout" | "auth" | "invalid-output" | "unknown",
): LogReason {
  switch (category) {
    case "quota":
      return "gemini-quota";
    case "timeout":
      return "gemini-timeout";
    case "auth":
      return "gemini-auth";
    case "invalid-output":
      return "gemini-invalid-output";
    default:
      return "gemini-network";
  }
}
