/**
 * Record languages (2.0). Every item, place and category keeps:
 *   lang       the language of its own text ("en", "ru", "es", ...)
 *   *_local    the text in that language (empty when lang = "en")
 *   *_en       English, always filled (AI in the background); the only text when lang = "en"
 * The user has one language ("my language": interface and records, profiles.lang) and may
 * show English next to it (profiles.show_english). Modes derived from that:
 *   en        English only (one field: *_en)
 *   local     my language on screen; English filled in by AI in the background
 *   local_en  both, edited side by side
 * A record in another language (after a language change, before its translation) is shown
 * in English; its own text is left as stored until it is translated or rewritten.
 * Shared by the server (actions, AI routes) and the client (forms, display).
 */
import { toLang, type Lang } from "@/lib/languages";

export type DataMode = "en" | "local" | "local_en";
/** Which of the two text slots of a record. */
export type Slot = "local" | "en";

export type DataLang = { lang: Lang; showEnglish: boolean; mode: DataMode };

export function dataLangOf(lang: unknown, showEnglish: unknown): DataLang {
  const l = toLang(lang);
  const show = l !== "en" && showEnglish === true;
  return { lang: l, showEnglish: show, mode: l === "en" ? "en" : show ? "local_en" : "local" };
}

/** The slot shown on screen. */
export const displaySlot = (mode: DataMode): Slot => (mode === "en" ? "en" : "local");

/**
 * Name/description fields shown in forms. A record in another language (`foreign`: English
 * only, as far as this user is concerned) also shows its English in local mode, so there is
 * something to edit; typing in the own-language field moves it to the user's language.
 */
export function editSlots(mode: DataMode, foreign = false): Slot[] {
  return mode === "en" ? ["en"] : mode === "local" && !foreign ? ["local"] : ["local", "en"];
}

/**
 * Columns to add when writing a record: a new record is in the user's language; an existing
 * one moves to it when its own text is (re)written.
 */
export function langColumn(userLang: Lang, isNew: boolean, written: { local?: string | null }) {
  return isNew || (written.local !== undefined && written.local !== null) ? { lang: userLang } : {};
}

/** Language code of a slot for this user (for lang="" attributes, labels, AI). */
export const slotLang = (slot: Slot, lang: Lang): Lang => (slot === "en" ? "en" : lang);

/**
 * The record's own text counts as "local" only when it is in the user's language;
 * a record in another language is shown and edited through English.
 */
export function ownLocal<T>(recordLang: string | null | undefined, userLang: Lang, value: T | null | undefined): T | null {
  return userLang !== "en" && recordLang === userLang ? (value ?? null) : null;
}

/** The record is in another language than the user's (shown and edited through English). */
export const isForeign = (recordLang: string | null | undefined, userLang: Lang) => userLang !== "en" && recordLang !== userLang;

/** Text in `slot`; if it is empty there, the other one. */
export function pickText(local: string | null | undefined, en: string | null | undefined, slot: Slot) {
  const [first, second] = slot === "en" ? [en, local] : [local, en];
  return first?.trim() ? first : (second ?? "");
}

/** Tags shown: English in en mode, own-language tags in local mode, both in local_en. */
export function visibleTags(mode: DataMode, local: string[], en: string[]) {
  if (mode === "en") return en;
  if (mode === "local") return local.length > 0 ? local : en;
  return [...local, ...en.filter((t) => !local.includes(t))];
}

type Pair = { local: string | null; en: string | null };

/**
 * One text field in both slots, as it goes to the database.
 * `input`: what the form sent ("" = empty); `current`: the stored row with the local text
 * already passed through ownLocal (null for a new record).
 * Returns only the slots to write: a slot the user does not see is not touched.
 *   en        English as typed; local: null for a new record, untouched otherwise.
 *   local     own text as typed; English as sent (AI fills both), but if the own text changed
 *             and the English did not, the English is stale: it is cleared and translated again.
 *   local_en  both as typed; an empty English is translated in the background.
 */
export function resolvePair(mode: DataMode, input: { local: string; en: string }, current: Pair | null): Partial<Pair> {
  const local = input.local.trim() || null;
  const en = input.en.trim() || null;
  if (mode === "en") return current ? { en } : { local: null, en };
  if (mode === "local") {
    const changed = current !== null && local !== current.local;
    const enUnchanged = current !== null && en === current.en;
    // A record in another language edited without own text: keep it, change nothing local.
    if (current && current.local === null && !local) return { en: en ?? current.en };
    return { local, en: !local || (changed && enUnchanged) ? null : en };
  }
  if (current && current.local === null && !local) return { en };
  return { local, en };
}

/** Which name is required (the form and the server use the same rule). */
export function hasRequiredName(mode: DataMode, local: string, en: string, foreign = false) {
  if (mode === "en" || foreign) return en.trim().length > 0 || (mode !== "en" && local.trim().length > 0);
  if (mode === "local") return local.trim().length > 0;
  return local.trim().length > 0 || en.trim().length > 0;
}

/** The field that carries the "required" error. */
export const requiredSlot = (mode: DataMode): Slot => (mode === "en" ? "en" : "local");
