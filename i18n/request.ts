import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getProfile } from "@/lib/auth";
import { langFromAcceptLanguage, toLang } from "@/lib/languages";
import { LOCALE_COOKIE, isLocale } from "./config";

// Locale without a /ru, /en prefix in URLs: the app is personal, URLs are never shared
// publicly, and clean paths are simpler for the PWA.
//   signed in -> profiles.lang ("my language", changed only in Settings)
//   guest     -> the cookie set by the small switcher on the auth screens, else the browser
export default getRequestConfig(async () => {
  const profile = await getProfile();
  let locale: string;
  if (profile) {
    locale = profile.lang;
  } else {
    const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    locale = isLocale(fromCookie) ? fromCookie : langFromAcceptLanguage((await headers()).get("accept-language"));
  }
  const lang = toLang(locale);
  return {
    locale: lang,
    messages: (await import(`../messages/${lang}.json`)).default,
  };
});
