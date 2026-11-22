import { DEFAULT_LANG, ENABLED_LANGS, isLang, type Lang } from "@/lib/languages";

export const locales = ENABLED_LANGS;
export type AppLocale = Lang;

// Signed-in users: the interface is "my language" (profiles.lang). Guests: the language they
// picked on the sign-in/sign-up screen (cookie), else the browser's, else English.
export const defaultLocale: AppLocale = DEFAULT_LANG;
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = isLang;
