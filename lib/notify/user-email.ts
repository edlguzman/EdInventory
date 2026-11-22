import "server-only";
import { getTranslations } from "next-intl/server";
import { toLang } from "@/lib/languages";
import { mailFrom, sendEmail, siteUrl } from "./resend";

export type UserEmailKind = "registered" | "approved" | "reactivated" | "disabled";

/**
 * Email to a user about their account. Sent only when MAIL_FROM (a domain verified in
 * Resend) is set; until then it is silently skipped. Language: the user's "my language"
 * (unknown: English). Plain text only. Call it inside after(): it never throws.
 */
export async function notifyUser({ kind, to, lang }: { kind: UserEmailKind; to: string; lang: string | null | undefined }) {
  const from = mailFrom();
  if (!from || !to) return;
  // In the user's language ("my language"); unknown -> English.
  const t = await getTranslations({ locale: toLang(lang), namespace: "userMail" });
  await sendEmail({
    from,
    to,
    subject: t(`${kind}.subject`),
    text: [t(`${kind}.body`), "", `${t("link")} ${siteUrl()}`, "", t("footer")].join("\n"),
    tag: `user-${kind}`,
  });
}
