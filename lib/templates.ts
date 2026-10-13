// Fixed localized message templates (spec section 13) and the localized field
// label dictionary added by addendum A-08. Day 3 only needs the fallback
// error templates; the rest arrives with the order workflow.

export type Language = "ar" | "fr" | "en";

export const LANGUAGES: Language[] = ["ar", "fr", "en"];

/** 13.8 Generic error / AI unavailable. */
export const GENERIC_ERROR: Record<Language, string> = {
  ar: "عذرًا، حدث خلل مؤقت. لم يتم تنفيذ أي إجراء. حاول مرة أخرى بعد قليل.",
  fr: "Désolé, un problème temporaire est survenu. Aucune action n'a été effectuée. Réessayez dans un instant.",
  en: "Sorry, something went wrong temporarily. No action was completed. Please try again shortly.",
};

/** 13.8 friendlier quota message, used for 429 / quota exhaustion. */
export const DEMO_BUSY: Record<Language, string> = {
  ar: "العرض التجريبي مشغول حاليًا. حاول مرة أخرى لاحقًا.",
  fr: "La démo est très sollicitée pour le moment. Réessayez un peu plus tard.",
  en: "The demo is busy right now. Please try again later.",
};

/**
 * Message too long (spec 9.1: 1-500 trimmed characters).
 */
export const MESSAGE_TOO_LONG: Record<Language, string> = {
  ar: "الرسالة طويلة جدًا. من فضلك اكتب رسالة أقصر.",
  fr: "Votre message est trop long. Merci d'écrire un message plus court.",
  en: "Your message is too long. Please write a shorter one.",
};

/**
 * Per-conversation customer message cap reached (spec 9.1).
 */
export const CONVERSATION_LIMIT: Record<Language, string> = {
  ar: "وصلت الحد الأقصى للرسائل في هذه المحادثة. من فضلك ابدأ محادثة جديدة.",
  fr: "Vous avez atteint la limite de messages pour cette conversation. Merci de commencer une nouvelle conversation.",
  en: "You have reached the message limit for this conversation. Please start a new conversation.",
};

/**
 * Invalid input body (spec 9.1).
 */
export const INVALID_REQUEST: Record<Language, string> = {
  ar: "الرسالة غير صالحة. من فضلك حاول مرة أخرى.",
  fr: "Message invalide. Merci de réessayer.",
  en: "Invalid message. Please try again.",
};

/** A-08: localized field labels. Never show raw enums. */
export const FIELD_LABELS: Record<
  Language,
  Record<string, string>
> = {
  ar: {
    size: "المقاس",
    color: "اللون",
    quantity: "الكمية",
    name: "الاسم",
    phone: "الهاتف",
    wilaya: "الولاية",
    address: "العنوان",
    product: "المنتج",
    deliveryMethod: "طريقة التوصيل",
  },
  fr: {
    size: "la taille",
    color: "la couleur",
    quantity: "la quantité",
    name: "le nom",
    phone: "le téléphone",
    wilaya: "la wilaya",
    address: "l'adresse",
    product: "le produit",
    deliveryMethod: "le mode de livraison",
  },
  en: {
    size: "size",
    color: "color",
    quantity: "quantity",
    name: "name",
    phone: "phone",
    wilaya: "wilaya",
    address: "address",
    product: "product",
    deliveryMethod: "delivery method",
  },
};

/** A-08: localized delivery method labels. */
export const DELIVERY_METHOD_LABELS: Record<
  Language,
  Record<"HOME" | "OFFICE", string>
> = {
  ar: { HOME: "المنزل", OFFICE: "مكتب التوصيل" },
  fr: { HOME: "domicile", OFFICE: "bureau de livraison" },
  en: { HOME: "home", OFFICE: "delivery office" },
};