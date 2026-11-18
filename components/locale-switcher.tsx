"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { locales } from "@/i18n/config";
import { setLocale } from "@/i18n/actions";

export function LocaleSwitcher() {
  const t = useTranslations("settings");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
              aria-pressed={active}
              onClick={() =>
                startTransition(async () => {
                  await setLocale(locale);
                  router.refresh();
                })
              }
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
