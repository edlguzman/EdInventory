import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { DeleteAccountForm } from "@/components/settings/delete-account";
import { Alert } from "@/components/ui/buttons";
import { getProfile, requireUser } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("delete") };
}

/** Settings → "Danger zone" → Delete account: what is lost, then the password and the word. */
export default async function DeleteAccountPage() {
  await requireUser();
  const [t, profile] = await Promise.all([getTranslations("account"), getProfile()]);
  return (
    <>
      <PageTitle>{t("delete")}</PageTitle>
      {profile?.isOwner ? <Alert tone="warning">{t("errors.owner")}</Alert> : <DeleteAccountForm />}
    </>
  );
}
