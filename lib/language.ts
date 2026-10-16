// Reply-language rules.
//
// Spec 8.2 and 16.2, plus the Day 8 fix. Kept out of the route so the rules can
// be unit tested offline, and so there is exactly one definition of "which
// language is this reply in".
//
// The bug this fixes: the backend used to derive the reply language from the
// SCRIPT alone, which can only yield "ar" or "fr". It then told Gemini
// "Reply in: fr" for every Latin-script message, so an English customer could
// never be answered in English. Latin script carries English, French and
// Darija alike, so the backend must not choose between them: the model is asked
// to answer in the customer's own language and to report what it used, and the
// backend trusts that value.

import type { Language } from "./templates";

/**
 * Spec 8.2: "for unclear mixed Arabic/French, prefer the dominant script".
 * Counts Arabic-script vs Latin letters so a mostly-English message that
 * merely contains one Arabic word is not forced to Arabic.
 */
export function dominantScriptIsArabic(text: string): boolean {
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
 * Explicit "speak language X" requests. Deliberately narrow: it only
 * recognises a customer naming a language, so it cannot fire on product names,
 * quantities or addresses. The demo catalogue is French, and no product,
 * wilaya or field label contains any of these words.
 */
export const LANGUAGE_REQUEST_MARKERS: Array<{ language: Language; re: RegExp }> = [
  {
    language: "ar",
    re: /\b(arabic|arabe)\b|parl[ea]z?\s+en\s+arabe|répondez\s+en\s+arabe|بالعربية|بالعربي\b/i,
  },
  {
    language: "en",
    re: /\benglish\b|parl[ea]z?\s+en\s+anglais|répondez\s+en\s+anglais|بالانجليزية|بالإنجليزية/i,
  },
  {
    language: "fr",
    re: /\bfrench\b|français|parl[ea]z?\s+en\s+français|répondez\s+en\s+français|بالفرنسية/i,
  },
];

/** The language the customer explicitly named in this message, if any. */
export function explicitLanguageRequest(latest: string): Language | undefined {
  for (const marker of LANGUAGE_REQUEST_MARKERS) {
    if (marker.re.test(latest)) return marker.language;
  }
  return undefined;
}

/**
 * The instruction appended to the prompt.
 *
 * For Arabic script the backend decides, because script alone is decisive
 * there. For Latin script the model is told to mirror the customer's language
 * and to report the one it used.
 */
export function replyInstruction(latest: string): string {
  if (dominantScriptIsArabic(latest)) {
    return 'LANGUAGE: the customer wrote in Arabic script. Answer in Arabic. Set "language" to "ar".';
  }
  return (
    "LANGUAGE: answer in the SAME language the customer used in the message above. " +
    'If the customer wrote in English, answer in English and set "language" to "en". ' +
    'If the customer wrote in French or in Latin-script Darija, answer in French and set "language" to "fr". ' +
    "Match the customer's language exactly; do not switch to another one."
  );
}

/** Short label recorded in rawAiOutput for debugging (A-06). */
export function replyInLabel(latest: string): "ar" | "model" {
  return dominantScriptIsArabic(latest) ? "ar" : "model";
}

/**
 * The language of the customer-visible reply, and of every backend template.
 *
 * Order of precedence:
 *   1. Arabic script in the message (spec 8.2 rule 1) -> ar.
 *   2. An explicit "speak X" request in the message -> X.
 *   3. A language the customer explicitly asked for earlier in this
 *      conversation and has not contradicted -> that language. This is what
 *      lets "answer me in English" survive a terse follow-up like "change the
 *      quantity to 1", which the model alone would re-classify.
 *   4. The language the model reported for this message, if it is en or fr.
 *   5. The conversation language, then fr.
 */
export function resolveReplyLanguage(input: {
  modelLanguage: string | undefined;
  latest: string;
  conversationLanguage?: Language;
  conversationLanguageExplicit?: boolean;
}): Language {
  const { modelLanguage, latest, conversationLanguage, conversationLanguageExplicit } = input;

  if (dominantScriptIsArabic(latest)) return "ar";

  const requested = explicitLanguageRequest(latest);
  if (requested) return requested;

  if (conversationLanguageExplicit && conversationLanguage) return conversationLanguage;

  // The model decides between English and French for Latin script. "ar" is not
  // accepted here: Arabic script was already ruled out in step 1.
  if (modelLanguage === "en" || modelLanguage === "fr") return modelLanguage;

  return conversationLanguage ?? "fr";
}

/**
 * What the previous AI row recorded about the conversation language: the
 * backend's own decision, and whether the customer asked for it explicitly.
 */
export function storedLanguage(raw: unknown): {
  language?: Language;
  explicit: boolean;
} {
  if (!raw || typeof raw !== "object") return { explicit: false };
  const value = (raw as { resolvedLanguage?: unknown }).resolvedLanguage;
  const explicit = (raw as { languageExplicit?: unknown }).languageExplicit === true;
  if (value === "ar" || value === "fr" || value === "en") return { language: value, explicit };
  return { explicit: false };
}