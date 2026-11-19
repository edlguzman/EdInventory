import "server-only";
import { getTranslations } from "next-intl/server";
import { mailFrom, sendEmail, siteUrl } from "./resend";

type Event = { kind: "signup" | "deleted"; email: string };

/**
 * Plain-text email to the admin (ADMIN_NOTIFY_EMAIL). Best effort: call it inside after(),
 * it never throws, and without RESEND_API_KEY / ADMIN_NOTIFY_EMAIL it does nothing.
 * Without MAIL_FROM the Resend test sender is used: it delivers to the Resend account
 * owner, who is the admin.
 */
export async function notifyAdmin({ kind, email }: Event) {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const t = await getTranslations({ locale: "ru", namespace: "notify" });
  const time = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  await sendEmail({
    from: mailFrom() ?? "Inventory <onboarding@resend.dev>",
    to,
    subject: t(`${kind}.subject`, { email }),
    text: [t(`${kind}.body`, { email, time }), "", `${t("adminLink")} ${siteUrl()}/admin`].join("\n"),
    tag: `admin-${kind}`,
  });
}
