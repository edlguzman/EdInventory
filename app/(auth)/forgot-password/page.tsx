import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default function ForgotPasswordPage() {
  const t = useTranslations("auth.forgot");
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ForgotPasswordForm />
    </>
  );
}
