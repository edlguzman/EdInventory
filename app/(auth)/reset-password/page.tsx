import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { requireUser } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

/** Reached from the recovery email via /auth/confirm, which signs the user in first. */
export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getTranslations("auth.reset");
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ResetPasswordForm />
    </>
  );
}
