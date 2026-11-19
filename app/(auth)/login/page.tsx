import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/safe-next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const next = safeNext(params.next);
  const linkError = params.error === "link";
  const deleted = params.deleted === "1";

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
      {deleted && (
        <p role="status" className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {t("accountDeleted")}
        </p>
      )}
      {linkError && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("linkError")}
        </p>
      )}
      <LoginForm next={next} />
      <Link href="/help" className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 self-center text-sm font-medium text-accent">
        <CircleHelp className="size-4" aria-hidden />
        {t("login.help")}
      </Link>
    </>
  );
}
