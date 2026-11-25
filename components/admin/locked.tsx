import Link from "next/link";
import { KeyRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";

/** Admin screens without "sign-in with a code": nothing is loaded, only how to turn it on. */
export async function AdminLocked() {
  const t = await getTranslations("admin");
  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="flex flex-col gap-4 rounded-2xl border border-border p-4">
        <span className="flex size-12 items-center justify-center rounded-xl bg-surface text-accent">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <h2 className="text-lg font-semibold">{t("lockedTitle")}</h2>
        <p className="text-muted">{t("lockedText")}</p>
        <Link
          href="/settings#code"
          className="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-foreground"
        >
          {t("lockedLink")}
        </Link>
      </div>
    </>
  );
}
