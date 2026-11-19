"use client";

import { useTranslations, type Messages } from "next-intl";

export type ErrorKey = keyof Messages["errors"];

/** Translates an error key from the "errors" namespace; unknown keys fall back to "unknown". */
export function useErrorText() {
  const t = useTranslations("errors");
  return (key: string | undefined | null) => {
    if (!key) return undefined;
    return t.has(key as ErrorKey) ? t(key as ErrorKey) : t("unknown");
  };
}
