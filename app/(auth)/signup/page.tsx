import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SignupForm } from "@/components/auth/signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

export default function SignupPage() {
  const t = useTranslations("auth.signup");
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <SignupForm />
    </>
  );
}
