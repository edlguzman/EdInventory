import "server-only";
import { getTranslations } from "next-intl/server";
import type { DataLang } from "@/lib/data-lang";
import { mailFrom, sendEmail, siteUrl } from "./resend";

export type UserEmailKind = "registered" | "approved" | "reactivated" | "disabled";

/**
 * Email to a user about their account. Sent only when MAIL_FROM (a domain verified in
 * Resend) is set; until then it is silently skipped. Language: English for the "en"
 * data mode, Russian otherwise. Plain text only. Call it inside after(): it never throws.
 */
export async function notifyUser({ kind, to, dataLang }: { kind: UserEmailKind; to: string; dataLang: DataLang }) {
  const from = mailFrom();
  if (!from || !to) return;
  const t = await getTranslations({ locale: dataLang === "en" ? "en" : "ru", namespace: "userMail" });
  await sendEmail({
    from,
    to,
    subject: t(`${kind}.subject`),
    text: [t(`${kind}.body`), "", `${t("link")} ${siteUrl()}`, "", t("footer")].join("\n"),
    tag: `user-${kind}`,
  });
}
