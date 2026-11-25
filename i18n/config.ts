import { DEFAULT_LANG, ENABLED_LANGS, isLang, type Lang } from "@/lib/languages";

export const locales = ENABLED_LANGS;
export type AppLocale = Lang;

// Signed-in users: the interface is "my language" (profiles.lang). Guests: the language they
// picked on the sign-in/sign-up screen (session cookie), else the browser's, else English.
export const defaultLocale: AppLocale = DEFAULT_LANG;
// A new name on purpose: the old year-long NEXT_LOCALE cookie is ignored, it kept overriding the browser.
export const LOCALE_COOKIE = "guest_lang";

export const isLocale = isLang;
