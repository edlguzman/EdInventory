"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { LANGUAGES } from "@/lib/languages";

/**
 * Small EN / RU / ES toggle for guests (sign-in and sign-up screens, /help before signing in).
 * Signed-in users have no switch: their interface is "my language", changed in Settings.
 */
export function LocaleSwitcher() {
  const t = useTranslations("settings");
  const current = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (locale: string) =>
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });

  return (
    <div role="group" aria-label={t("language")} className="flex rounded-xl border border-border p-0.5">
      {LANGUAGES.filter((l) => l.enabled).map(({ code, native }) => {
        const active = code === current;
        return (
          <button
            key={code}
            type="button"
            lang={code}
            disabled={pending}
            aria-pressed={active}
            aria-label={native}
            onClick={() => change(code)}
            className={`min-h-10 min-w-10 rounded-lg px-1.5 text-sm font-medium uppercase disabled:opacity-60 ${
              active ? "bg-surface text-foreground" : "text-muted"
            }`}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
