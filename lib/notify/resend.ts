import "server-only";

/**
 * Sender for all emails. MAIL_FROM ("Inventory <noreply@your-domain>") needs a domain
 * verified in Resend. Without it Resend's test sender is used, which can deliver only
 * to the Resend account owner: enough for the admin, not for users.
 */
export function mailFrom() {
  return process.env.MAIL_FROM?.trim() || null;
}

/**
 * Link target in emails. Not taken from request headers: a forged Origin would put
 * someone else's link into an email. VERCEL_PROJECT_PRODUCTION_URL is set by Vercel.
 */
export function siteUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/**
 * Plain-text email through the Resend API. Best effort: never throws, returns whether
 * Resend accepted it. Logs carry only `tag` and the HTTP status (no addresses, no text).
 */
export async function sendEmail({ from, to, subject, text, tag }: { from: string; to: string; subject: string; text: string; tag: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("email failed", { tag, status: res.status });
    return res.ok;
  } catch (error) {
    console.error("email failed", { tag, type: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
