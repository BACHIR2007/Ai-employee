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

/**
 * Field-level rejection templates. Spec 8.4 rule 1: when the backend rejects
 * a field it REPLACES the model's reply entirely with one of these, so the
 * customer never sees a reply that contradicts the rejection.
 */
export type FieldTemplate =
  | "invalid-size"
  | "invalid-color"
  | "invalid-quantity"
  | "quantity-too-high"
  | "invalid-name"
  | "invalid-phone"
  | "unknown-wilaya"
  | "invalid-address"
  | "address-not-allowed"
  | "product-not-found";

/** 13.10 Product not found / not orderable. */
export const PRODUCT_NOT_FOUND: Record<Language, string> = {
  ar: "عذرًا، لم أتمكن من العثور على هذا المنتج في الكتالوج الحالي. اختر منتجًا من المنتجات المتاحة.",
  fr: "Désolé, je ne trouve pas ce produit dans le catalogue actuel. Choisissez un produit disponible.",
  en: "Sorry, I couldn't find that product in the current catalog. Please choose an available product.",
};

/** 13.4 Invalid size or color, with the A-08 {availableOptions} list. */
export const INVALID_SIZE_OR_COLOR: Record<Language, string> = {
  ar: "عذرًا، هذا المقاس أو اللون غير متوفر لهذا المنتج. المتاح: {availableOptions}. اختر من فضلك.",
  fr: "Désolé, cette taille ou cette couleur n'est pas disponible pour ce produit. Disponibles : {availableOptions}. Choisissez parmi ces options.",
  en: "Sorry, that size or color is not available for this product. Available: {availableOptions}. Please choose one of these.",
};

/** Generic invalid-option wording when no product is selected yet (A-08). */
export const INVALID_OPTION_NO_PRODUCT: Record<Language, string> = {
  ar: "عذرًا، هذا الخيار غير متوفر. اختر من فضلك.",
  fr: "Désolé, cette option n'est pas disponible. Choisissez parmi les options proposées.",
  en: "Sorry, that option is not available. Please choose from the available options.",
};

/** 13.7 Quantity too high. */
export const QUANTITY_TOO_HIGH: Record<Language, string> = {
  ar: "الكمية المطلوبة أكبر من الكمية المتوفرة حاليًا. لدينا {stockQuantity} فقط. ما الكمية التي تريدها؟",
  fr: "La quantité demandée dépasse le stock disponible. Il en reste {stockQuantity}. Quelle quantité souhaitez-vous ?",
  en: "The requested quantity is higher than the available stock. We have {stockQuantity} left. What quantity would you like?",
};

/** Invalid quantity (not a positive integer). */
export const INVALID_QUANTITY: Record<Language, string> = {
  ar: "الكمية غير صحيحة. من فضلك أدخل رقمًا أكبر من صفر.",
  fr: "La quantité n'est pas valide. Merci d'indiquer un nombre supérieur à zéro.",
  en: "That quantity is not valid. Please enter a number greater than zero.",
};

/** 13.5 Invalid phone number. */
export const INVALID_PHONE: Record<Language, string> = {
  ar: "رقم الهاتف غير صحيح. أدخل رقم هاتف محمول جزائريًا يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.",
  fr: "Le numéro semble invalide. Entrez un numéro mobile algérien de 10 chiffres commençant par 05, 06 ou 07.",
  en: "That phone number doesn't look valid. Enter a 10-digit Algerian mobile number starting with 05, 06, or 07.",
};

/** 13.6 Unknown wilaya. */
export const UNKNOWN_WILAYA: Record<Language, string> = {
  ar: "لم أتعرف على الولاية. اختر ولاية جزائرية صحيحة من فضلك.",
  fr: "Je n'ai pas reconnu cette wilaya. Veuillez choisir une wilaya algérienne valide.",
  en: "I couldn't recognize that wilaya. Please provide a valid Algerian wilaya.",
};

/** Invalid delivery address. */
export const INVALID_ADDRESS: Record<Language, string> = {
  ar: "العنوان غير مكتمل. من فضلك اكتب عنوانًا واضحًا للتوصيل.",
  fr: "L'adresse est incomplète. Merci d'indiquer une adresse de livraison claire.",
  en: "That address is incomplete. Please provide a clear delivery address.",
};

/** A-07: OFFICE delivery takes no address. */
export const ADDRESS_NOT_ALLOWED: Record<Language, string> = {
  ar: "التوصيل إلى مكتب التوصيل لا يحتاج عنوانًا. من فضلك اختر التوصيل إلى المنزل إذا كنت تريد عنوانًا.",
  fr: "La livraison au bureau ne nécessite pas d'adresse. Choisissez la livraison à domicile si vous voulez une adresse.",
  en: "Delivery to the office does not need an address. Choose home delivery if you want one delivered to your address.",
};

/** Invalid customer name. */
export const INVALID_NAME: Record<Language, string> = {
  ar: "الاسم غير صحيح. من فضلك اكتب اسمك كاملًا.",
  fr: "Le nom n'est pas valide. Merci d'indiquer votre nom complet.",
  en: "That name is not valid. Please enter your full name.",
};

/** 13.9 Draft cancelled. */
export const DRAFT_CANCELLED: Record<Language, string> = {
  ar: "تم إلغاء الطلب قبل تسجيله. يمكنك طرح سؤال آخر أو البدء بطلب جديد.",
  fr: "Le brouillon de commande a été annulé. Vous pouvez poser une autre question ou commencer une nouvelle commande.",
  en: "The draft order was cancelled. You can ask another question or start a new order.",
};

/** A-04 / A-08 new template 13.11: product changed, some fields were cleared. */
export const PRODUCT_CHANGED: Record<Language, string> = {
  ar: "تم تغيير المنتج إلى {product}. يرجى اختيار {missingList} من جديد.",
  fr: "Le produit est maintenant {product}. Veuillez choisir à nouveau : {missingList}.",
  en: "The product is now {product}. Please choose again: {missingList}.",
};