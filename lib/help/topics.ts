/** Sections of the help (keys of help.sections in the dictionaries), in the page's order. */
export const HELP_TOPICS = [
  "start",
  "add",
  "multi",
  "voice",
  "places",
  "items",
  "books",
  "bulk",
  "languages",
  "plan",
  "account",
] as const;

export type HelpTopic = (typeof HELP_TOPICS)[number];

/**
 * The help section of a screen by its address (screens and blocks can be more specific with
 * useHelpTopic: selection mode, "Several items", a book, Settings blocks). null = the beginning.
 */
export function topicForPath(pathname: string): HelpTopic | null {
  if (pathname === "/" || pathname === "/search") return "items";
  if (pathname === "/add") return "add";
  if (/^\/items\/[^/]+\/edit$/.test(pathname)) return "add";
  if (/^\/items\/[^/]+$/.test(pathname)) return "items";
  if (pathname === "/locations" || pathname.startsWith("/locations/")) return "places";
  if (pathname === "/settings") return "account";
  if (/^\/(login|signup|register|forgot-password|reset-password|auth)(\/|$)/.test(pathname)) return "start";
  return null;
}
