/** Plan names in every language (plans.names: {"en": "Free", "ru": "...", "es": "..."}). */
export type PlanNames = Record<string, string>;

export function toPlanNames(value: unknown): PlanNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === "string"));
}

/** The plan's name in `locale`, else English, else its code. */
export function planName(names: unknown, locale: string, code = "") {
  const n = toPlanNames(names);
  return n[locale]?.trim() || n.en?.trim() || code;
}
