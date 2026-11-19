/** Same normalization as public.normalize_search() in the database: lower case, "ё" -> "е". */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

/** Query split into normalized words. */
export function searchTokens(query: string): string[] {
  return normalizeSearch(query).split(/\s+/).filter(Boolean);
}

/** True when every query word occurs somewhere in the text ("гараж стеллаж"). */
export function matchesAllTokens(text: string, tokens: string[]): boolean {
  const haystack = normalizeSearch(text);
  return tokens.every((t) => haystack.includes(t));
}
