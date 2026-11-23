/**
 * Merging recognized medicine data into the form. Empty fields are filled; a field that already
 * has a value is never changed: when `offer` is set and a factual value differs (strength,
 * expiry, NDC, active ingredient, prescription, composition; official FDA uses/warnings over AI
 * text) it comes back as a conflict ("Found: … · Replace"). Client-side, pure.
 */
import type { FdaDrugInfo, MedicineSuggestion } from "@/lib/ai/types";
import { emptyMedicineInput, type MedicineInput } from "./attrs";
import { formatExpiry, parseExpiry, type Expiry } from "./expiry";
import { normalizeNdc } from "./ndc";

export type MedConflictField = "active" | "strength" | "rx" | "components" | "expires" | "ndc" | "uses" | "warnings";
export type MedConflict = { field: MedConflictField; shown: string; patch: Partial<MedicineInput> };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
/** An active ingredient without its dose or notes: "Ibuprofen (200 mg)" = "ibuprofen". */
const ingredient = (s: string) =>
  norm(s.replace(/\([^)]*\)/g, " ").replace(/\d+([.,]\d+)?\s*(mg|mcg|µg|g|ml|iu|ме|мг|мкг|г|мл|%)(?=$|[^a-zа-яё])/gi, " "))
    .replace(/[,;.\s]+$/g, "")
    .trim();
const componentsText = (c: MedicineInput["components"], slot: "local" | "en") =>
  c.map((x) => [slot === "local" ? x.name_local || x.name_en : x.name_en || x.name_local, x.amount].filter(Boolean).join(" ")).join(", ");

/** A recognized medicine as form input. */
export function inputFromSuggestion(s: MedicineSuggestion): MedicineInput {
  return {
    ...emptyMedicineInput(s.subtype),
    active_local: s.active_local,
    active_en: s.active_en,
    form_local: s.form_local,
    form_en: s.form_en,
    uses_local: s.uses_local,
    uses_en: s.uses_en,
    warnings_local: s.warnings_local,
    warnings_en: s.warnings_en,
    strength: s.strength,
    rx: s.rx ?? "",
    components: s.components.map((c) => ({ ...c })),
    expires: s.expires ? formatExpiry(s.expires) : "",
    ndc: s.ndc ?? "",
    source: s.source,
  };
}

/** Facts from the FDA directory (no uses / warnings) plus the expiry a DataMatrix gave. */
export function suggestionFromDrug(d: FdaDrugInfo, expiry: Expiry | null): MedicineSuggestion {
  const single = d.activeIngredients.length === 1 ? d.activeIngredients[0] : null;
  return {
    subtype: "medicine",
    active_local: "",
    active_en: single?.name ?? (d.activeIngredients.map((a) => a.name).join(", ") || d.genericName || ""),
    strength: single?.strength ?? d.activeIngredients.map((a) => a.strength ?? "").filter(Boolean).join(" / "),
    form_local: "",
    form_en: d.dosageForm ?? "",
    rx: d.rx,
    components: [],
    expires: expiry,
    uses_local: "",
    uses_en: "",
    warnings_local: "",
    warnings_en: "",
    ndc: d.ndc,
    source: "fda",
  };
}

/**
 * `current` + recognized `s` -> the new form input and the differing values to offer.
 * `slot`: the language slot shown on screen (for the conflict text).
 */
export function mergeMedicine(
  current: MedicineInput | null,
  s: MedicineSuggestion,
  { offer, slot }: { offer: boolean; slot: "local" | "en" },
): { next: MedicineInput; conflicts: MedConflict[] } {
  if (!current) return { next: inputFromSuggestion(s), conflicts: [] };
  const next: MedicineInput = { ...current, components: current.components.map((c) => ({ ...c })) };
  const conflicts: MedConflict[] = [];
  const fill = <K extends keyof MedicineInput>(key: K, value: MedicineInput[K]) => {
    if (typeof next[key] === "string" && !(next[key] as string).trim() && typeof value === "string" && value.trim()) next[key] = value;
  };

  // Active ingredient: a pair; differs when the shown text differs.
  const curActive = slot === "local" ? current.active_local || current.active_en : current.active_en || current.active_local;
  const newActive = slot === "local" ? s.active_local || s.active_en : s.active_en || s.active_local;
  if (!current.active_local.trim() && !current.active_en.trim()) {
    next.active_local = s.active_local;
    next.active_en = s.active_en;
  } else {
    fill("active_local", s.active_local);
    fill("active_en", s.active_en);
    if (offer && newActive && curActive && ingredient(newActive) !== ingredient(curActive)) {
      conflicts.push({ field: "active", shown: newActive, patch: { active_local: s.active_local, active_en: s.active_en } });
    }
  }
  fill("form_local", s.form_local);
  fill("form_en", s.form_en);

  if (!current.strength.trim()) next.strength = s.strength;
  else if (offer && s.strength && norm(s.strength) !== norm(current.strength)) conflicts.push({ field: "strength", shown: s.strength, patch: { strength: s.strength } });

  if (s.rx) {
    if (!current.rx) next.rx = s.rx;
    else if (offer && s.rx !== current.rx) conflicts.push({ field: "rx", shown: s.rx, patch: { rx: s.rx } });
  }

  if (s.components.length) {
    if (current.components.length === 0) next.components = s.components.map((c) => ({ ...c }));
    else if (offer && norm(componentsText(s.components, slot)) !== norm(componentsText(current.components, slot))) {
      conflicts.push({ field: "components", shown: componentsText(s.components, slot), patch: { components: s.components.map((c) => ({ ...c })) } });
    }
  }

  if (s.expires) {
    const cur = parseExpiry(current.expires);
    const text = formatExpiry(s.expires);
    if (!current.expires.trim() || !cur) next.expires = text;
    else if (offer && cur.date !== s.expires.date) conflicts.push({ field: "expires", shown: text, patch: { expires: text } });
  }

  if (s.ndc) {
    const cur = normalizeNdc(current.ndc);
    if (!cur) next.ndc = s.ndc;
    else if (offer && cur !== s.ndc) conflicts.push({ field: "ndc", shown: s.ndc, patch: { ndc: s.ndc } });
  }

  // Uses / warnings: generated text; filled when empty. Official FDA text is offered over AI text.
  const hadUses = !!(current.uses_local.trim() || current.uses_en.trim());
  const hadWarnings = !!(current.warnings_local.trim() || current.warnings_en.trim());
  if (!hadUses && (s.uses_local || s.uses_en)) {
    next.uses_local = s.uses_local;
    next.uses_en = s.uses_en;
  }
  if (!hadWarnings && (s.warnings_local || s.warnings_en)) {
    next.warnings_local = s.warnings_local;
    next.warnings_en = s.warnings_en;
  }
  if (s.source === "fda" && current.source !== "fda") {
    const pick = (l: string, e: string) => (slot === "local" ? l || e : e || l);
    if (hadUses && (s.uses_local || s.uses_en)) {
      conflicts.push({ field: "uses", shown: pick(s.uses_local, s.uses_en), patch: { uses_local: s.uses_local, uses_en: s.uses_en, source: "fda" } });
    }
    if (hadWarnings && (s.warnings_local || s.warnings_en)) {
      conflicts.push({ field: "warnings", shown: pick(s.warnings_local, s.warnings_en), patch: { warnings_local: s.warnings_local, warnings_en: s.warnings_en, source: "fda" } });
    }
  }
  // The source follows the uses/warnings shown: official once they came from the FDA.
  if (!current.source || (s.source === "fda" && !hadUses && !hadWarnings)) next.source = s.source;
  return { next, conflicts: offer ? conflicts : [] };
}
