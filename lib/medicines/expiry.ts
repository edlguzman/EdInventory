/**
 * Expiry dates of medicines and supplements. Packaging often shows only month and year
 * ("EXP 05/2027"): then the date stored is the last day of that month and it is shown "05/2027".
 * Shared by the client and the server. Dates are plain "YYYY-MM-DD" strings (no time zone).
 */

export type ExpiryPrecision = "month" | "day";
export type Expiry = { date: string; precision: ExpiryPrecision };

/** Days counted as "expires soon". */
export const EXPIRY_SOON_DAYS = 30;

const pad = (n: number) => String(n).padStart(2, "0");

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function valid(year: number, month: number, day: number) {
  return year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= lastDay(year, month);
}

/** GS1 (17) YYMMDD; day "00" means the whole month. */
export function expiryFromYymmdd(s: string): Expiry | null {
  if (!/^\d{6}$/.test(s)) return null;
  const year = 2000 + Number(s.slice(0, 2));
  const month = Number(s.slice(2, 4));
  const day = Number(s.slice(4, 6));
  if (day === 0) return month >= 1 && month <= 12 ? { date: `${year}-${pad(month)}-${pad(lastDay(year, month))}`, precision: "month" } : null;
  return valid(year, month, day) ? { date: `${year}-${pad(month)}-${pad(day)}`, precision: "day" } : null;
}

/**
 * What the AI or the user wrote -> Expiry: "2027-05", "2027-05-14", "05/2027", "05.2027",
 * "14.05.2027", "05/27". Anything else -> null.
 */
export function parseExpiry(value: string): Expiry | null {
  const v = value.trim();
  let m: RegExpMatchArray | null;
  const month = (y: number, mo: number): Expiry | null =>
    y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 ? { date: `${y}-${pad(mo)}-${pad(lastDay(y, mo))}`, precision: "month" } : null;
  const day = (y: number, mo: number, d: number): Expiry | null =>
    valid(y, mo, d) ? { date: `${y}-${pad(mo)}-${pad(d)}`, precision: "day" } : null;
  if ((m = v.match(/^(\d{4})-(\d{1,2})$/))) return month(+m[1], +m[2]);
  if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return day(+m[1], +m[2], +m[3]);
  if ((m = v.match(/^(\d{1,2})[/.\-](\d{4})$/))) return month(+m[2], +m[1]);
  if ((m = v.match(/^(\d{1,2})[/.\-](\d{2})$/))) return month(2000 + +m[2], +m[1]);
  if ((m = v.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/))) return day(+m[3], +m[2], +m[1]);
  return null;
}

/** Shown as "05/2027" (month) or "14/05/2027" (day). */
export function formatExpiry(e: Expiry): string {
  const [y, m, d] = e.date.split("-");
  return e.precision === "month" ? `${m}/${y}` : `${d}/${m}/${y}`;
}

/** Today as YYYY-MM-DD in the local time zone. */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** today + days, YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export type ExpiryStatus = "expired" | "soon" | "ok";

/** Expired = the stored day has passed; soon = within EXPIRY_SOON_DAYS. */
export function expiryStatus(date: string, today = todayIso()): ExpiryStatus {
  if (date < today) return "expired";
  if (date <= addDaysIso(today, EXPIRY_SOON_DAYS)) return "soon";
  return "ok";
}
