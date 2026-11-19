export const locales = ["ru", "en"] as const;
export type AppLocale = (typeof locales)[number];

// A new visitor sees English; Russian is switched on by hand and remembered in the cookie.
export const defaultLocale: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
