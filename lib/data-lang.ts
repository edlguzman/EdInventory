/**
 * Data languages: which language the text of items, places and categories is kept in.
 *   en     English only
 *   ru     Russian on screen; English filled in by AI in the background
 *   ru_en  both languages, edited side by side
 * The other language is never deleted when the mode changes, only hidden.
 * Shared by the server (actions, AI routes) and the client (forms, display).
 */

export type DataLang = "en" | "ru" | "ru_en";
export type TextLang = "ru" | "en";

export const DATA_LANGS: readonly DataLang[] = ["en", "ru", "ru_en"];

export const isDataLang = (v: unknown): v is DataLang => v === "en" || v === "ru" || v === "ru_en";

/** Mode chosen at sign-up from the interface language. */
export const dataLangForLocale = (locale: string): DataLang => (locale === "ru" ? "ru" : "en");

/** The language shown on screen: fixed for en / ru, the interface language for ru_en. */
export function displayLang(mode: DataLang, locale: string): TextLang {
  if (mode === "en") return "en";
  if (mode === "ru") return "ru";
  return locale === "en" ? "en" : "ru";
}

/** Fields shown in forms. */
export function editLangs(mode: DataLang): TextLang[] {
  return mode === "en" ? ["en"] : mode === "ru" ? ["ru"] : ["ru", "en"];
}

/**
 * Languages that should exist for every record in this mode, i.e. what translation fills in.
 * en needs only English; ru keeps English filled too, so switching to en or ru_en is instant.
 */
export function neededLangs(mode: DataLang): TextLang[] {
  return mode === "en" ? ["en"] : ["ru", "en"];
}

/** Text in `lang`; if it is empty there, the other language. */
export function pickText(ru: string | null | undefined, en: string | null | undefined, lang: string) {
  const [first, second] = lang === "en" ? [en, ru] : [ru, en];
  return first?.trim() ? first : (second ?? "");
}

const CYRILLIC = /[а-яё]/i;
const LATIN = /[a-z]/i;

/**
 * Tags have no language marker. In en mode Cyrillic tags are hidden; in ru mode tags
 * written only in Latin letters are hidden; ru_en shows all. Hidden tags are kept on save.
 */
export function isVisibleTag(tag: string, mode: DataLang) {
  if (mode === "en") return !CYRILLIC.test(tag);
  if (mode === "ru") return CYRILLIC.test(tag) || !LATIN.test(tag);
  return true;
}

type Pair = { ru: string | null; en: string | null };

/**
 * One text field in both languages, as it goes to the database.
 * `input`: what the form sent ("" = empty); `current`: the stored row (null for a new record).
 * Returns only the columns to write: a hidden language is not touched on update.
 *   en     English as typed; Russian: null for a new record, untouched otherwise.
 *   ru     Russian as typed; English as sent (AI fills both), but if the Russian text changed
 *          and the English did not, the English is stale: it is cleared and translated again.
 *   ru_en  both as typed; for names an empty English gets the Russian text (agreed rule),
 *          an empty Russian stays empty (shown in English, offered for translation).
 */
export function resolvePair(
  mode: DataLang,
  input: { ru: string; en: string },
  current: Pair | null,
  { copyToEnglish }: { copyToEnglish: boolean },
): Partial<Pair> {
  const ru = input.ru.trim() || null;
  const en = input.en.trim() || null;
  if (mode === "en") return current ? { en } : { ru: null, en };
  if (mode === "ru") {
    const ruChanged = current !== null && ru !== current.ru;
    const enUnchanged = current !== null && en === current.en;
    return { ru, en: !ru || (ruChanged && enUnchanged) ? null : en };
  }
  return { ru, en: en ?? (copyToEnglish ? ru : null) };
}

/** Which name is required in which mode (the form and the server use the same rule). */
export function hasRequiredName(mode: DataLang, ru: string, en: string) {
  if (mode === "en") return en.trim().length > 0;
  if (mode === "ru") return ru.trim().length > 0;
  return ru.trim().length > 0 || en.trim().length > 0;
}

/**
 * Languages the user is asked to translate into after switching to `mode` (and offered in
 * Settings). Ru mode asks only for Russian: its English is filled in silently.
 */
export function promptLangs(mode: DataLang): TextLang[] {
  return mode === "en" ? ["en"] : mode === "ru" ? ["ru"] : ["ru", "en"];
}
