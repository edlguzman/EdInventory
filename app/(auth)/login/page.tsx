import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
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

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
      {linkError && (
        <p role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("linkError")}
        </p>
      )}
      <LoginForm next={next} />
    </>
  );
}
