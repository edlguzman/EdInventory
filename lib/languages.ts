/**
 * The one list of supported languages: interface, records and AI answers.
 * Adding a language = a messages/<code>.json dictionary + a row here (+ default category
 * names in the sign-up SQL, otherwise new accounts get English ones).
 *   code     ISO 639-1, also the next-intl locale and profiles.lang
 *   native   the language's own name (language pickers)
 *   english  its English name (AI prompts)
 *   enabled  shown to users; a disabled row keeps existing data readable
 */
export const LANGUAGES = [
  { code: "en", native: "English", english: "English", enabled: true },
  { code: "ru", native: "Русский", english: "Russian", enabled: true },
  { code: "es", native: "Español", english: "Spanish", enabled: true },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANG: Lang = "en";

export const ENABLED_LANGS: readonly Lang[] = LANGUAGES.filter((l) => l.enabled).map((l) => l.code);

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (ENABLED_LANGS as readonly string[]).includes(value);
}

/** Any stored or sent code -> a supported language (unknown -> English). */
export function toLang(value: unknown): Lang {
  return isLang(value) ? value : DEFAULT_LANG;
}

export function languageInfo(code: Lang) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/** English name of a language, for AI prompts ("Spanish"). */
export const englishName = (code: Lang) => languageInfo(code).english;

/**
 * A guest's language from the browser's Accept-Language header ("es-ES,es;q=0.9,en;q=0.8"):
 * the first supported one by preference, else English.
 */
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return DEFAULT_LANG;
  const wanted = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { code: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((w) => w.code && w.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return wanted.map((w) => w.code).find(isLang) ?? DEFAULT_LANG;
}
