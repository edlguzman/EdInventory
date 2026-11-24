/**
 * Comparing a stored book with catalogue candidates (search by title, no ISBN). Pure functions.
 * "Exact" is strict on purpose: the same title (case, ё/е, accents and punctuation aside) and
 * the same author; everything else is only a guess the user has to confirm.
 */

export type BookCandidate = {
  title: string;
  subtitle: string | null;
  authors: string[];
  year: number | null;
  isbn: string | null;
  language: string | null;
};

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .normalize("NFD")
    // Latin accents only: й must stay й (its breve is dropped and put back by NFC below).
    .replace(/([a-z])[̀-ͯ]+/g, "$1")
    .normalize("NFC");

const tokens = (s: string) => plain(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export const normTitle = (s: string) => tokens(s).join(" ");

/** The same title, or our title written with the catalogue's subtitle. */
export function sameTitle(own: string, c: Pick<BookCandidate, "title" | "subtitle">) {
  const a = normTitle(own);
  if (!a) return false;
  return a === normTitle(c.title) || (!!c.subtitle && a === normTitle(`${c.title} ${c.subtitle}`));
}

/** Share of common words (0–1), to drop candidates that have nothing to do with the book. */
export function titleOverlap(own: string, c: Pick<BookCandidate, "title" | "subtitle">) {
  const a = new Set(tokens(own));
  const b = new Set(tokens(c.title));
  if (a.size === 0 || b.size === 0) return 0;
  const common = [...a].filter((t) => b.has(t)).length;
  return common / Math.max(a.size, b.size);
}

/**
 * The same person: every full word of the shorter name is in the longer one, and initials agree
 * ("Л. Толстой" = "Лев Николаевич Толстой", but not "Алексей Толстой").
 */
export function sameAuthor(a: string, b: string) {
  const [x, y] = [tokens(a), tokens(b)];
  const words = (t: string[]) => t.filter((w) => w.length >= 3);
  const [short, long] = words(x).length <= words(y).length ? [x, y] : [y, x];
  const full = words(short);
  if (full.length === 0 || !full.every((w) => long.includes(w))) return false;
  // Initials on either side must fit one of the other side's remaining words.
  const initialsFit = (from: string[], to: string[]) => {
    const rest = to.filter((w) => !full.includes(w));
    return rest.length === 0 || from.filter((w) => w.length <= 2).every((i) => rest.some((w) => w.startsWith(i) || i.startsWith(w)));
  };
  return initialsFit(short, long) && initialsFit(long, short);
}

/** "A, B; C" -> single names. */
export const splitAuthors = (s: string) => s.split(/[,;&]| и | and | y /i).map((x) => x.trim()).filter(Boolean);

const anyAuthor = (own: string | null, c: BookCandidate) =>
  !!own && splitAuthors(own).some((a) => c.authors.some((b) => sameAuthor(a, b)));

/** The best candidate and whether it is exact (title and author). null = none is close enough. */
export function pickCandidate(own: { title: string; author: string | null }, list: BookCandidate[]): { candidate: BookCandidate; exact: boolean } | null {
  let best: { candidate: BookCandidate; exact: boolean; score: number } | null = null;
  for (const c of list) {
    const title = sameTitle(own.title, c);
    const overlap = title ? 1 : titleOverlap(own.title, c);
    const author = anyAuthor(own.author, c);
    if (overlap < (author ? 0.5 : 0.7)) continue;
    // A known author who is not among the candidate's: only the very same title is worth showing.
    if (own.author && c.authors.length > 0 && !author && !title) continue;
    const score = (title ? 4 : overlap * 2) + (author ? 3 : 0) + (c.isbn ? 1 : 0) + (c.year ? 0.5 : 0);
    if (!best || score > best.score) best = { candidate: c, exact: title && author, score };
  }
  return best && { candidate: best.candidate, exact: best.exact };
}
