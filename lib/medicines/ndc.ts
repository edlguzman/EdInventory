/**
 * US drug barcodes -> NDC (National Drug Code), and the expiry date a GS1 DataMatrix carries.
 * Shared by the client (barcode on the phone) and the server (FDA lookup).
 *
 * UPC-A on a drug package: "3" + the 10-digit NDC + check digit (also read as EAN-13 "03…").
 * GS1 DataMatrix (DSCSA): (01) GTIN-14 = "0" + "3" + NDC10 + check, (17) expiry YYMMDD,
 * (10) lot, (21) serial. A 10-digit NDC without dashes is ambiguous (4-4-2, 5-3-2 or 5-4-1),
 * so all three spellings are looked up.
 */
import { expiryFromYymmdd, type Expiry } from "./expiry";

export type NdcScan = { ndc: string; expiry: Expiry | null };

const GS = "\u001d";

function gs1CheckOk(digits: string) {
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

/** NDC10 from a UPC-A (12 digits) / EAN-13 (13 digits) / GTIN-14 of a drug package, else null. */
export function ndcFromGtin(code: string): string | null {
  const d = code.replace(/\D/g, "");
  if (!/^\d{12,14}$/.test(d) || !gs1CheckOk(d)) return null;
  const gtin14 = d.padStart(14, "0");
  // "003" + NDC10 + check (indicator digit 0, UPC number system 3 = drugs).
  return gtin14.startsWith("003") ? gtin14.slice(3, 13) : null;
}

/** Fixed-length GS1 application identifiers we may meet before the ones we need. */
const FIXED: Record<string, number> = { "01": 14, "02": 14, "11": 6, "13": 6, "15": 6, "16": 6, "17": 6 };

/** GS1 element string (DataMatrix text, with or without "]d2" and GS separators) -> AI values. */
export function parseGs1(raw: string): Record<string, string> {
  let s = raw.replace(/^\][A-Za-z]\d/, "");
  // Some readers show the parenthesized form: (01)0030…(17)270531(10)ABC.
  if (s.startsWith("(")) {
    const out: Record<string, string> = {};
    for (const m of s.matchAll(/\((\d{2,4})\)([^(]*)/g)) out[m[1]] = m[2];
    return out;
  }
  const out: Record<string, string> = {};
  s = s.replace(/^\u001d/, "");
  while (s.length >= 2) {
    const ai2 = s.slice(0, 2);
    if (ai2 in FIXED) {
      out[ai2] = s.slice(2, 2 + FIXED[ai2]);
      s = s.slice(2 + FIXED[ai2]).replace(/^\u001d/, "");
      continue;
    }
    // Variable length up to the next GS: (10) lot, (21) serial; other AIs are skipped the same way.
    const ai = ai2 === "24" || ai2 === "71" ? s.slice(0, 3) : ai2;
    const rest = s.slice(ai.length);
    const end = rest.indexOf(GS);
    out[ai] = end === -1 ? rest : rest.slice(0, end);
    if (end === -1) break;
    s = rest.slice(end + 1);
  }
  return out;
}

/** A drug NDC (and expiry, from a DataMatrix) in one barcode's text, or null. */
export function ndcFromBarcode(raw: string): NdcScan | null {
  const text = raw.trim();
  if (/^\d{12,13}$/.test(text)) {
    const ndc = ndcFromGtin(text);
    return ndc ? { ndc, expiry: null } : null;
  }
  const ais = parseGs1(text);
  if (!ais["01"]) return null;
  const ndc = ndcFromGtin(ais["01"]);
  if (!ndc) return null;
  return { ndc, expiry: ais["17"] ? expiryFromYymmdd(ais["17"]) : null };
}

/**
 * An NDC as printed -> NDC10 digits, else null: 10 digits with or without dashes, or the
 * 11-digit billing form 5-4-2 with dashes (the padded segment is the one starting with 0).
 */
export function normalizeNdc(value: string): string | null {
  const v = value.trim();
  const d = v.replace(/[\s-]/g, "");
  if (/^\d{10}$/.test(d)) return d;
  const parts = v.split("-");
  if (/^\d{11}$/.test(d) && parts.length === 3 && parts[0].length === 5 && parts[1].length === 4 && parts[2].length === 2) {
    const [a, b, c] = parts;
    if (a.startsWith("0")) return a.slice(1) + b + c;
    if (b.startsWith("0")) return a + b.slice(1) + c;
    if (c.startsWith("0")) return a + b + c.slice(1);
  }
  return null;
}

/** The three dashed spellings of an NDC10 (4-4-2, 5-3-2, 5-4-1), as the FDA lists package NDCs. */
export function ndcSpellings(ndc10: string): string[] {
  const d = ndc10;
  return [`${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`, `${d.slice(0, 5)}-${d.slice(5, 8)}-${d.slice(8)}`, `${d.slice(0, 5)}-${d.slice(5, 9)}-${d.slice(9)}`];
}
