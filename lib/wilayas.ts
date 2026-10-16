// Canonical Algerian wilaya list and resolution.
//
// SOURCE (official, not Wikipedia):
//   - Loi n° 26-06 du 4 avril 2026 relative a la nouvelle organisation
//     territoriale du pays, Journal Officiel n° 25 du 5 avril 2026. This
//     raised the number of wilayas from 58 to 69.
//   - Decret presidentiel n° 26-206 du 8 Dhou El Hidja 1447, correspondant au
//     25 mai 2026, completant le decret n° 84-79 du 3 avril 1984 fixant les
//     noms et les chefs-lieux des wilayas, Journal Officiel n° 40 du 3 juin
//     2026. This fixes the names, chefs-lieux and numbers of codes 59 to 69.
// Consulted 14 October 2026. Codes 1-58 come from decret 84-79 of 3 April 1984
// and its amendments (decret 21-117 of 22 March 2021 added codes 49-58).
//
// KNOWN DIFFERENCE resolved on 14 October 2026: decret 26-206 spells code 68
// "Bou Saâda", so that is now the canonical nameFr. The former spelling
// "Bousaâda" is kept as an alias so existing data still resolves.
//
// Per addendum A-01: Order.wilaya stores the canonical nameFr. Gemini returns
// the wilaya exactly as the customer wrote it and this module resolves it.
//
// This module is pure TypeScript. It performs no database access.

export type Wilaya = {
  /** Official numeric code, 1..69. */
  code: number;
  /** Official French name. */
  nameFr: string;
  /** Official Arabic name. */
  nameAr: string;
};

export const WILAYAS: Wilaya[] = [
  { code: 1, nameFr: "Adrar", nameAr: "أدرار" },
  { code: 2, nameFr: "Chlef", nameAr: "الشلف" },
  { code: 3, nameFr: "Laghouat", nameAr: "الأغواط" },
  { code: 4, nameFr: "Oum El Bouaghi", nameAr: "أم البواقي" },
  { code: 5, nameFr: "Batna", nameAr: "باتنة" },
  { code: 6, nameFr: "Béjaïa", nameAr: "بجاية" },
  { code: 7, nameFr: "Biskra", nameAr: "بسكرة" },
  { code: 8, nameFr: "Béchar", nameAr: "بشار" },
  { code: 9, nameFr: "Blida", nameAr: "البليدة" },
  { code: 10, nameFr: "Bouïra", nameAr: "البويرة" },
  { code: 11, nameFr: "Tamanrasset", nameAr: "تامنراست" },
  { code: 12, nameFr: "Tébessa", nameAr: "تبسة" },
  { code: 13, nameFr: "Tlemcen", nameAr: "تلمسان" },
  { code: 14, nameFr: "Tiaret", nameAr: "تيارت" },
  { code: 15, nameFr: "Tizi Ouzou", nameAr: "تيزي وزو" },
  { code: 16, nameFr: "Alger", nameAr: "الجزائر" },
  { code: 17, nameFr: "Djelfa", nameAr: "الجلفة" },
  { code: 18, nameFr: "Jijel", nameAr: "جيجل" },
  { code: 19, nameFr: "Sétif", nameAr: "سطيف" },
  { code: 20, nameFr: "Saïda", nameAr: "سعيدة" },
  { code: 21, nameFr: "Skikda", nameAr: "سكيكدة" },
  { code: 22, nameFr: "Sidi Bel Abbès", nameAr: "سيدي بلعباس" },
  { code: 23, nameFr: "Annaba", nameAr: "عنابة" },
  { code: 24, nameFr: "Guelma", nameAr: "قالمة" },
  { code: 25, nameFr: "Constantine", nameAr: "قسنطينة" },
  { code: 26, nameFr: "Médéa", nameAr: "المدية" },
  { code: 27, nameFr: "Mostaganem", nameAr: "مستغانم" },
  { code: 28, nameFr: "M'Sila", nameAr: "المسيلة" },
  { code: 29, nameFr: "Mascara", nameAr: "معسكر" },
  { code: 30, nameFr: "Ouargla", nameAr: "ورقلة" },
  { code: 31, nameFr: "Oran", nameAr: "وهران" },
  { code: 32, nameFr: "El Bayadh", nameAr: "البيض" },
  { code: 33, nameFr: "Illizi", nameAr: "اليزي" },
  { code: 34, nameFr: "Bordj Bou Arréridj", nameAr: "برج بوعريريج" },
  { code: 35, nameFr: "Boumerdès", nameAr: "بومرداس" },
  { code: 36, nameFr: "El Tarf", nameAr: "الطارف" },
  { code: 37, nameFr: "Tindouf", nameAr: "تندوف" },
  { code: 38, nameFr: "Tissemsilt", nameAr: "تسمسيلت" },
  { code: 39, nameFr: "El Oued", nameAr: "الوادي" },
  { code: 40, nameFr: "Khenchela", nameAr: "خنشلة" },
  { code: 41, nameFr: "Souk Ahras", nameAr: "سوق أهراس" },
  { code: 42, nameFr: "Tipaza", nameAr: "تيبازة" },
  { code: 43, nameFr: "Mila", nameAr: "ميلة" },
  { code: 44, nameFr: "Aïn Defla", nameAr: "عين الدفلى" },
  { code: 45, nameFr: "Naâma", nameAr: "النعامة" },
  { code: 46, nameFr: "Aïn Témouchent", nameAr: "عين تموشنت" },
  { code: 47, nameFr: "Ghardaïa", nameAr: "غرداية" },
  { code: 48, nameFr: "Relizane", nameAr: "غليزان" },
  { code: 49, nameFr: "Timimoun", nameAr: "تيميمون" },
  { code: 50, nameFr: "Bordj Badji Mokhtar", nameAr: "برج باجي مختار" },
  { code: 51, nameFr: "Ouled Djellal", nameAr: "أولاد جلال" },
  { code: 52, nameFr: "Béni Abbès", nameAr: "بني عباس" },
  { code: 53, nameFr: "In Salah", nameAr: "عين صالح" },
  { code: 54, nameFr: "In Guezzam", nameAr: "عين قزّام" },
  { code: 55, nameFr: "Touggourt", nameAr: "تقرت" },
  { code: 56, nameFr: "Djanet", nameAr: "جانت" },
  { code: 57, nameFr: "El M'Ghair", nameAr: "المغير" },
  { code: 58, nameFr: "El Menia", nameAr: "المنيعة" },
  // Added by Law N° 26-06, 4 April 2026.
  { code: 59, nameFr: "Aflou", nameAr: "آفلو" },
  { code: 60, nameFr: "Barika", nameAr: "بريكة" },
  { code: 61, nameFr: "El Kantara", nameAr: "القنطرة" },
  { code: 62, nameFr: "Bir El Ater", nameAr: "بئر العاتر" },
  { code: 63, nameFr: "El Aricha", nameAr: "العريشة" },
  { code: 64, nameFr: "Ksar Chellala", nameAr: "قصر الشلالة" },
  { code: 65, nameFr: "Aïn Oussera", nameAr: "عين وسارة" },
  { code: 66, nameFr: "Messaad", nameAr: "مسعد" },
  { code: 67, nameFr: "Ksar El Boukhari", nameAr: "قصر البخاري" },
  { code: 68, nameFr: "Bou Saâda", nameAr: "بوسعادة" },
  { code: 69, nameFr: "El Abiodh Sidi Cheikh", nameAr: "الأبيض سيدي الشيخ" },
];

const BY_CODE = new Map<number, Wilaya>(WILAYAS.map((w) => [w.code, w]));

/**
 * A-02: convert Arabic-Indic (U+0660-0669) and Extended Arabic-Indic
 * (U+06F0-06F9) digits to ASCII digits.
 */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * A-01 normalization: strip Arabic diacritics and tatweel, remove Latin
 * accents, lowercase, unify Arabic letter variants, turn hyphens/apostrophes/
 * underscores into spaces, collapse repeated spaces and drop a leading
 * "wilaya", "wilaya de" or "ولاية".
 */
export function normalizeWilayaText(input: string): string {
  let s = normalizeDigits(input).trim();

  // Arabic diacritics (fatha, damma, kasra, tanween, sukun, shadda,
  // superscript alef) and the Arabic decorative marks.
  s = s.replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "");
  // Tatweel / kashida.
  s = s.replace(/\u0640/g, "");

  // Latin accents: decompose then drop combining marks.
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Arabic letter variants -> a single canonical form.
  s = s.replace(/[\u0623\u0625\u0622]/g, "\u0627"); // أ إ آ -> ا
  s = s.replace(/\u0649/g, "\u064a"); // ى -> ي
  s = s.replace(/\u0629/g, "\u0647"); // ة -> ه

  // Hyphens, apostrophes (straight and typographic) and underscores -> space.
  s = s.replace(/[-_'’\u2019]/g, " ");

  s = s.toLowerCase();
  s = s.replace(/\s+/g, " ").trim();

  // Drop a leading "wilaya de" / "wilaya" / "ولاية". After normalization
  // ولاية becomes ولايه because ة maps to ه.
  for (let i = 0; i < 2; i += 1) {
    s = s.replace(/^(?:ولايه|wilaya de|wilaya)\s*/, "");
  }

  return s.trim();
}

/**
 * A-01: a small alias map for alternative spellings that appear in the
 * sources consulted. Keys are already-normalized forms.
 */
const ALIASES: Record<string, number> = {
  // Chlef was officially renamed from El Asnam in 1980; still widely used.
  "el asnam": 2,
  // Common spellings of Laghouat in Latin script.
  aghouat: 3,
  "laghouate": 3,
  // Common Arabic spellings. Tissemsilt is written with or without the
  // second ya, and Algerian customers often add the definite article.
  "تيسمسيلت": 38,
  "تسمسيلت": 38,
  "ولاية تيسمسيلت": 38,
  // Common English and transliteration spellings.
  algiers: 16,
  wahran: 31,
  ouahrane: 31,
  // "Tlemcen" city is تلموس; the wilaya is written تلمسان.
  "تلموس": 13,
  // Frequent transliteration variants.
  "bou areridj": 34,
  "borj bou arreridj": 34,
  "boumerdas": 35,
  "oum el bouagui": 4,
  skidda: 21,
  "souq ahras": 41,
  "ghelizane": 48,
  "tamanghasset": 11,
  "tamenghasset": 11,
  "el djelfa": 17,
  // The 2026 additions have competing spellings in the sources.
  "bou saada": 68,
  bousada: 68,
  "bousaada": 68,
  "el abiod sidi cheikh": 69,
  "el abiod": 69,
};

const BY_NAME = (() => {
  const map = new Map<string, Wilaya>();
  for (const w of WILAYAS) {
    map.set(normalizeWilayaText(w.nameFr), w);
    map.set(normalizeWilayaText(w.nameAr), w);
  }
  return map;
})();

/**
 * A-01: resolve whatever the customer (or Gemini) wrote to a canonical entry.
 * Matches the numeric code with or without a leading zero, the normalized
 * French name, the normalized Arabic name, or a known alias.
 * Returns null for anything not on the allowlist.
 */
export function resolveWilaya(input: string): Wilaya | null {
  if (typeof input !== "string") return null;

  const withDigits = normalizeDigits(input).trim();
  if (withDigits.length === 0) return null;

  // Numeric code, with or without a leading zero.
  if (/^\d{1,2}$/.test(withDigits)) {
    const code = Number(withDigits);
    return BY_CODE.get(code) ?? null;
  }

  const normalized = normalizeWilayaText(input);
  if (normalized.length === 0) return null;

  const direct = BY_NAME.get(normalized);
  if (direct) return direct;

  const alias = ALIASES[normalized];
  if (alias !== undefined) return BY_CODE.get(alias) ?? null;

  // Arabic spellings differ mainly by a missing or extra alef/ya, so retry
  // once after collapsing those letters. This is a bounded fallback, not a
  // fuzzy matcher: it only fires for a genuine miss and still requires an
  // explicit alias to succeed.
  const collapsed = (value: string) =>
    value.replace(/[اويىه]/g, "").replace(/\s+/g, "");
  const loose = collapsed(normalized);
  if (loose.length > 0 && loose !== normalized) {
    for (const w of WILAYAS) {
      if (collapsed(normalizeWilayaText(w.nameFr)) === loose) return w;
      if (collapsed(normalizeWilayaText(w.nameAr)) === loose) return w;
    }
  }

  // The canonical Arabic names do not agree on the definite article: some
  // carry it (الجلفة) and some do not (مسعد), so a customer who writes the
  // other form is told the wilaya does not exist. Drop a leading "ال" on both
  // sides of the comparison.
  //
  // This is still bounded and unambiguous: collapsing the letters and then
  // stripping the article yields 138 distinct keys from the 138 wilaya names,
  // so a stripped key can match at most one wilaya. Verified in
  // scripts/wilaya-audit.ts and by the unit tests.
  const stripped = (value: string) => collapsed(value.replace(/^ال/, ""));
  const looseKey = stripped(normalized);
  if (looseKey.length > 0) {
    for (const w of WILAYAS) {
      if (stripped(normalizeWilayaText(w.nameFr)) === looseKey) return w;
      if (stripped(normalizeWilayaText(w.nameAr)) === looseKey) return w;
    }
  }

  return null;
}