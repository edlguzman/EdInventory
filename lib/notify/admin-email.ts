import "server-only";
import { getTranslations } from "next-intl/server";

type Event = { kind: "signup" | "deleted"; email: string };

/**
 * Link target in the email. Not taken from request headers: a forged Origin at sign-up
 * would put someone else's link into the admin's mailbox. VERCEL_PROJECT_PRODUCTION_URL
 * is set by Vercel itself.
 */
function siteUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/**
 * Plain-text email to the admin (ADMIN_NOTIFY_EMAIL) through the Resend API.
 * Without a verified domain Resend sends only to the Resend account owner, which is
 * exactly the admin. Best effort: call it inside after(), it never throws, and without
 * RESEND_API_KEY / ADMIN_NOTIFY_EMAIL it does nothing. Logs carry only the status.
 */
export async function notifyAdmin({ kind, email }: Event) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  try {
    const t = await getTranslations({ locale: "ru", namespace: "notify" });
    const time = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const subject = t(`${kind}.subject`, { email });
    const text = [t(`${kind}.body`, { email, time }), "", `${t("adminLink")} ${siteUrl()}/admin`].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Inventory <onboarding@resend.dev>", to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("admin notification failed", { status: res.status });
  } catch (error) {
    console.error("admin notification failed", { type: error instanceof Error ? error.name : "unknown" });
  }
}
