import "server-only";
import type { FdaDrugInfo } from "@/lib/ai/types";
import { ndcSpellings } from "./ndc";

/**
 * Official US drug data by NDC from openFDA (no key): the NDC directory (names, strength, form,
 * OTC / prescription) and the drug label (uses and warnings, official text). Only the NDC leaves
 * the server. Answers are cached in memory for a day; failures are not cached.
 */

const HOST = "https://api.fda.gov";
const TIMEOUT_MS = 6000;
const MAX_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 1000;
/** Official text handed to the AI to summarize (per section, then in total). */
const SECTION_MAX = 2500;
const LABEL_TEXT_MAX = 8000;

export type FdaDrug = {
  ndc: string;
  brandName: string | null;
  genericName: string | null;
  /** "IBUPROFEN 200 mg" etc. */
  activeIngredients: { name: string; strength: string | null }[];
  dosageForm: string | null;
  rx: "rx" | "otc" | null;
  /** Official label text (English), for the AI to summarize: purpose / indications. */
  usesText: string | null;
  /** Official label text (English): boxed warning, warnings, do not use, ask a doctor, stop use. */
  warningsText: string | null;
};

const cache = new Map<string, { value: FdaDrug | null; expires: number }>();

class FdaError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${HOST}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "InventoryApp/1.0 (personal home inventory)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
    redirect: "error",
  });
  // 404 = nothing matched (openFDA answers "No matches found!" with 404).
  if (res.status === 404) return null;
  if (!res.ok) throw new FdaError(res.status);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new FdaError(413);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new FdaError(413);
  return JSON.parse(body);
}

const first = (v: unknown): Record<string, unknown> | null => {
  const results = v && typeof v === "object" ? (v as { results?: unknown }).results : null;
  return Array.isArray(results) && results[0] && typeof results[0] === "object" ? (results[0] as Record<string, unknown>) : null;
};

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

/** A label section (array of strings) as plain text, its heading word ("Warnings", "Uses") dropped. */
function section(label: Record<string, unknown>, key: string): string | null {
  const v = label[key];
  const t = Array.isArray(v) ? v.filter((x) => typeof x === "string").join(" ") : typeof v === "string" ? v : "";
  const clean = t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, SECTION_MAX) : null;
}

const join = (parts: (string | null)[]) => {
  const t = parts.filter(Boolean).join("\n").slice(0, LABEL_TEXT_MAX);
  return t || null;
};

function rxOf(productType: unknown, marketing: unknown): "rx" | "otc" | null {
  const t = String(productType ?? "").toUpperCase();
  if (t.includes("OTC")) return "otc";
  if (t.includes("PRESCRIPTION")) return "rx";
  return String(marketing ?? "").toUpperCase().includes("OTC") ? "otc" : null;
}

/** Title Case for the all-caps FDA names ("ADVIL" -> "Advil"). */
function titleCase(s: string | null) {
  if (!s) return null;
  return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()) : s;
}

/** The drug with this NDC10 (any of its three dashed spellings), or null when the FDA has none. */
export async function lookupNdc(ndc10: string): Promise<FdaDrug | null> {
  const hit = cache.get(ndc10);
  if (hit && hit.expires > Date.now()) return hit.value;

  const spellings = ndcSpellings(ndc10);
  const q = (field: string) => spellings.map((s) => `${field}:"${s}"`).join("+");
  try {
    const [directory, label] = await Promise.all([
      getJson(`/drug/ndc.json?search=${q("packaging.package_ndc")}&limit=1`),
      getJson(`/drug/label.json?search=${q("openfda.package_ndc")}&limit=1`),
    ]);
    const d = first(directory);
    const l = first(label);
    if (!d && !l) {
      remember(ndc10, null);
      return null;
    }
    const openfda = (l?.openfda ?? {}) as Record<string, unknown>;
    const firstOf = (v: unknown) => (Array.isArray(v) ? v[0] : v);
    const ingredients = Array.isArray(d?.active_ingredients)
      ? (d.active_ingredients as unknown[]).flatMap((x) => {
          const o = x as Record<string, unknown>;
          const name = titleCase(str(o?.name, 120));
          return name ? [{ name, strength: str(o?.strength, 60)?.replace(/\/1$/, "") ?? null }] : [];
        })
      : [];
    const value: FdaDrug = {
      ndc: ndc10,
      brandName: titleCase(str(d?.brand_name) ?? str(firstOf(openfda.brand_name))),
      genericName: titleCase(str(d?.generic_name) ?? str(firstOf(openfda.generic_name))),
      activeIngredients: ingredients.slice(0, 10),
      dosageForm: titleCase(str(d?.dosage_form, 100)),
      rx: rxOf(d?.product_type ?? firstOf(openfda.product_type), d?.marketing_category),
      usesText: l ? join([section(l, "purpose"), section(l, "indications_and_usage")]) : null,
      warningsText: l
        ? join([
            section(l, "boxed_warning"),
            section(l, "warnings"),
            section(l, "do_not_use"),
            section(l, "ask_doctor"),
            section(l, "stop_use"),
            section(l, "pregnancy_or_breast_feeding"),
          ])
        : null,
    };
    remember(ndc10, value);
    return value;
  } catch (error) {
    // Status or error type only (the URL holds nothing secret, but logs stay minimal).
    console.error("fda lookup failed", error instanceof FdaError ? { status: error.status } : { error: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

function remember(key: string, value: FdaDrug | null) {
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/** What the client gets back (no long official text: that goes only to the AI on the server). */
export function publicDrug(d: FdaDrug): FdaDrugInfo {
  const { usesText, warningsText, ...rest } = d;
  return { ...rest, hasLabel: !!(usesText || warningsText) };
}

/** "Ibuprofen 200 mg, Pseudoephedrine HCl 30 mg" -> active text and strength for the form. */
export function activeAndStrength(d: FdaDrug): { active: string | null; strength: string | null } {
  if (d.activeIngredients.length === 0) return { active: d.genericName, strength: null };
  if (d.activeIngredients.length === 1) return { active: d.activeIngredients[0].name, strength: d.activeIngredients[0].strength };
  return {
    active: d.activeIngredients.map((a) => a.name).join(", "),
    strength: d.activeIngredients.map((a) => a.strength ?? "").filter(Boolean).join(" / ") || null,
  };
}
