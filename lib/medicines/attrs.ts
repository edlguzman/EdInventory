/**
 * Medicines and supplements (items.kind = 'medicine'): what items.attrs holds, how the form
 * sends it, and how it is written by the user's language mode (same rules as names, see
 * lib/data-lang). Shared by the client and the server; the server validates with these schemas.
 *
 * Text pairs (*_local / *_en) follow the record language model: *_local is in the record's
 * language, *_en English. strength, amount, for_whom and ndc are language-neutral.
 */
import { z } from "zod";
import { resolvePair, type DataMode } from "@/lib/data-lang";
import { formatExpiry, parseExpiry, type ExpiryPrecision } from "./expiry";
import { normalizeNdc } from "./ndc";

export type MedSubtype = "medicine" | "supplement";
export type RxStatus = "rx" | "otc";
export type MedSource = "fda" | "ai";

export const MED_ACTIVE_MAX = 300;
export const MED_FORM_MAX = 100;
export const MED_STRENGTH_MAX = 100;
export const MED_USES_MAX = 600;
export const MED_WARNINGS_MAX = 1200;
export const MED_FOR_WHOM_MAX = 200;
export const MED_COMPONENTS_MAX = 30;
export const MED_COMPONENT_NAME_MAX = 120;
export const MED_AMOUNT_MAX = 60;

/** The text pairs of a medicine (both slots each). */
export const MED_PAIRS = ["active", "form", "uses", "warnings"] as const;
export type MedPair = (typeof MED_PAIRS)[number];

export type MedComponent = { name_local: string | null; name_en: string | null; amount: string | null };

/** items.attrs of a medicine / supplement, as stored. */
export type MedicineAttrs = {
  subtype: MedSubtype;
  active_local: string | null;
  active_en: string | null;
  form_local: string | null;
  form_en: string | null;
  uses_local: string | null;
  uses_en: string | null;
  warnings_local: string | null;
  warnings_en: string | null;
  strength: string | null;
  rx: RxStatus | null;
  components: MedComponent[];
  for_whom: string | null;
  ndc: string | null;
  source: MedSource | null;
  expiry_precision: ExpiryPrecision | null;
  /** Set by the server when an own-language text has no English yet (background translation). */
  needs_en?: boolean;
};

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Stored attrs -> MedicineAttrs (anything unknown or malformed is dropped). */
export function readMedicineAttrs(raw: unknown): MedicineAttrs {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const components = Array.isArray(a.components)
    ? a.components.slice(0, MED_COMPONENTS_MAX).flatMap((c) => {
        if (!c || typeof c !== "object") return [];
        const x = c as Record<string, unknown>;
        const item = {
          name_local: str(x.name_local, MED_COMPONENT_NAME_MAX),
          name_en: str(x.name_en, MED_COMPONENT_NAME_MAX),
          amount: str(x.amount, MED_AMOUNT_MAX),
        };
        return item.name_local || item.name_en ? [item] : [];
      })
    : [];
  return {
    subtype: a.subtype === "supplement" ? "supplement" : "medicine",
    active_local: str(a.active_local, MED_ACTIVE_MAX),
    active_en: str(a.active_en, MED_ACTIVE_MAX),
    form_local: str(a.form_local, MED_FORM_MAX),
    form_en: str(a.form_en, MED_FORM_MAX),
    uses_local: str(a.uses_local, MED_USES_MAX),
    uses_en: str(a.uses_en, MED_USES_MAX),
    warnings_local: str(a.warnings_local, MED_WARNINGS_MAX),
    warnings_en: str(a.warnings_en, MED_WARNINGS_MAX),
    strength: str(a.strength, MED_STRENGTH_MAX),
    rx: a.rx === "rx" || a.rx === "otc" ? a.rx : null,
    components,
    for_whom: str(a.for_whom, MED_FOR_WHOM_MAX),
    ndc: typeof a.ndc === "string" ? normalizeNdc(a.ndc) : null,
    source: a.source === "fda" || a.source === "ai" ? a.source : null,
    expiry_precision: a.expiry_precision === "month" || a.expiry_precision === "day" ? a.expiry_precision : null,
    ...(a.needs_en === true ? { needs_en: true } : {}),
  };
}

/** A record in another language: its own-language text is not the user's (shown through English). */
export function maskMedicineAttrs(a: MedicineAttrs, foreign: boolean): MedicineAttrs {
  if (!foreign) return a;
  return {
    ...a,
    active_local: null,
    form_local: null,
    uses_local: null,
    warnings_local: null,
    components: a.components.map((c) => ({ ...c, name_local: null })),
  };
}

const text = (max: number) => z.string().trim().max(max, { error: "medicineTooLong" });

/** What the form sends ("" = none). Validated on the server. */
export const medicineInputSchema = z.object({
  subtype: z.enum(["medicine", "supplement"]),
  active_local: text(MED_ACTIVE_MAX),
  active_en: text(MED_ACTIVE_MAX),
  form_local: text(MED_FORM_MAX),
  form_en: text(MED_FORM_MAX),
  uses_local: text(MED_USES_MAX),
  uses_en: text(MED_USES_MAX),
  warnings_local: text(MED_WARNINGS_MAX),
  warnings_en: text(MED_WARNINGS_MAX),
  strength: text(MED_STRENGTH_MAX),
  rx: z.enum(["rx", "otc", ""]),
  components: z
    .array(
      z.object({
        name_local: text(MED_COMPONENT_NAME_MAX),
        name_en: text(MED_COMPONENT_NAME_MAX),
        amount: text(MED_AMOUNT_MAX),
      }),
    )
    .max(MED_COMPONENTS_MAX, { error: "medicineTooLong" }),
  for_whom: text(MED_FOR_WHOM_MAX),
  /** "" or what the user typed / the AI read ("05/2027", "2027-05-31", ...). */
  expires: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || parseExpiry(v) !== null, { error: "expiryInvalid" }),
  ndc: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === "" || normalizeNdc(v) !== null, { error: "ndcInvalid" }),
  source: z.enum(["fda", "ai", ""]),
});

export type MedicineInput = z.input<typeof medicineInputSchema>;

/** An empty medicine draft (the form's state when the block is opened by hand). */
export function emptyMedicineInput(subtype: MedSubtype = "medicine"): MedicineInput {
  return {
    subtype,
    active_local: "",
    active_en: "",
    form_local: "",
    form_en: "",
    uses_local: "",
    uses_en: "",
    warnings_local: "",
    warnings_en: "",
    strength: "",
    rx: "",
    components: [],
    for_whom: "",
    expires: "",
    ndc: "",
    source: "",
  };
}

/** Stored attrs (+ expires_on) -> form input. */
export function medicineInputOf(a: MedicineAttrs, expiresOn: string | null): MedicineInput {
  const e = expiresOn ? formatExpiry({ date: expiresOn, precision: a.expiry_precision ?? "day" }) : "";
  return {
    subtype: a.subtype,
    active_local: a.active_local ?? "",
    active_en: a.active_en ?? "",
    form_local: a.form_local ?? "",
    form_en: a.form_en ?? "",
    uses_local: a.uses_local ?? "",
    uses_en: a.uses_en ?? "",
    warnings_local: a.warnings_local ?? "",
    warnings_en: a.warnings_en ?? "",
    strength: a.strength ?? "",
    rx: a.rx ?? "",
    components: a.components.map((c) => ({ name_local: c.name_local ?? "", name_en: c.name_en ?? "", amount: c.amount ?? "" })),
    for_whom: a.for_whom ?? "",
    expires: e,
    ndc: a.ndc ?? "",
    source: a.source ?? "",
  };
}

/**
 * Form input -> attrs + expires_on to write. Text pairs go through resolvePair against the
 * stored values (`current`, already masked for a foreign record; `stored` unmasked): a slot the
 * user does not see keeps what is stored. Sets needs_en when an own-language text lacks English.
 */
export function toMedicineRow(
  v: z.output<typeof medicineInputSchema>,
  mode: DataMode,
  current: MedicineAttrs | null,
  stored: MedicineAttrs | null,
): { attrs: MedicineAttrs; expires_on: string | null } {
  const out: Record<string, unknown> = {};
  for (const key of MED_PAIRS) {
    const r = resolvePair(
      mode,
      { local: v[`${key}_local`], en: v[`${key}_en`] },
      current && { local: current[`${key}_local`], en: current[`${key}_en`] },
    );
    out[`${key}_local`] = "local" in r ? r.local : (stored?.[`${key}_local`] ?? null);
    out[`${key}_en`] = "en" in r ? r.en : (stored?.[`${key}_en`] ?? null);
  }
  const components: MedComponent[] = v.components.flatMap((c, i) => {
    const cur = current?.components[i];
    const r = resolvePair(mode, { local: c.name_local, en: c.name_en }, cur ? { local: cur.name_local, en: cur.name_en } : current ? { local: null, en: null } : null);
    const name_local = "local" in r ? (r.local ?? null) : (stored?.components[i]?.name_local ?? null);
    const name_en = "en" in r ? (r.en ?? null) : (stored?.components[i]?.name_en ?? null);
    const amount = c.amount || null;
    return name_local || name_en ? [{ name_local, name_en, amount }] : [];
  });
  const expiry = v.expires ? parseExpiry(v.expires) : null;
  const attrs: MedicineAttrs = {
    subtype: v.subtype,
    active_local: out.active_local as string | null,
    active_en: out.active_en as string | null,
    form_local: out.form_local as string | null,
    form_en: out.form_en as string | null,
    uses_local: out.uses_local as string | null,
    uses_en: out.uses_en as string | null,
    warnings_local: out.warnings_local as string | null,
    warnings_en: out.warnings_en as string | null,
    strength: v.strength || null,
    rx: v.subtype === "medicine" && v.rx ? v.rx : null,
    components,
    for_whom: v.for_whom || null,
    ndc: v.ndc ? normalizeNdc(v.ndc) : null,
    source: v.source || null,
    expiry_precision: expiry?.precision ?? null,
  };
  if (mode !== "en" && lacksEnglish(attrs)) attrs.needs_en = true;
  return { attrs, expires_on: expiry?.date ?? null };
}

/** An own-language text without its English (to be translated in the background). */
export function lacksEnglish(a: MedicineAttrs) {
  return (
    MED_PAIRS.some((k) => a[`${k}_local`] && !a[`${k}_en`]) || a.components.some((c) => c.name_local && !c.name_en)
  );
}

/** Category names that mean medicines / supplements (any of the app's languages). */
const MEDICINES_NAMES = ["лекарства", "лекарство", "medicines", "medicine", "medications", "medicamentos", "medicinas"];
const SUPPLEMENTS_NAMES = [
  "витамины и добавки",
  "витамины",
  "бады",
  "добавки",
  "vitamins & supplements",
  "vitamins and supplements",
  "supplements",
  "vitamins",
  "vitaminas y suplementos",
  "suplementos",
  "vitaminas",
];

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/ё/g, "е");

export function isMedicinesCategoryName(name: string | null | undefined) {
  return MEDICINES_NAMES.includes(norm(name));
}

export function isSupplementsCategoryName(name: string | null | undefined) {
  return SUPPLEMENTS_NAMES.includes(norm(name));
}

/** The user's category for this subtype, by name in either slot. */
export function medicineCategoryId(
  categories: { id: string; name_local: string | null; name_en: string | null }[],
  subtype: MedSubtype,
): string | null {
  const match = subtype === "supplement" ? isSupplementsCategoryName : isMedicinesCategoryName;
  return categories.find((c) => match(c.name_local) || match(c.name_en))?.id ?? null;
}
