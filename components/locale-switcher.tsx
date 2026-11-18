"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

/** Full variant for settings; `compact` is a small RU/EN toggle for the auth screens. */
export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("settings");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (locale: string) =>
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });

  if (compact) {
    return (
      <div role="group" aria-label={t("language")} className="flex rounded-xl border border-border p-0.5">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="button"
              lang={locale}
              disabled={pending}
              aria-pressed={active}
              aria-label={t(`languages.${locale}`)}
              onClick={() => change(locale)}
              className={`min-h-10 min-w-11 rounded-lg px-2 text-sm font-medium uppercase disabled:opacity-60 ${
                active ? "bg-surface text-foreground" : "text-muted"
              }`}
            >
              {locale}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <fieldset disabled={pending} className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-muted">{t("language")}</legend>
      <div className="grid grid-cols-2 gap-2">
        {locales.map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="button"
              lang={locale}
              aria-pressed={active}
              onClick={() => change(locale)}
              className={`min-h-11 rounded-xl border px-4 font-medium transition-colors disabled:opacity-60 ${
                active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
              }`}
            >
              {t(`languages.${locale}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
