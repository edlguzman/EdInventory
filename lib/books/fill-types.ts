/** "Complete book data": what one catalogue lookup proposes (shared by the server and the client). */

/** Fields that can be filled; only empty ones are ever proposed or written. */
export const FILL_FIELDS = ["author", "year", "isbn", "nameEn"] as const;
export type FillField = (typeof FILL_FIELDS)[number];

export type FillProposal = {
  id: string;
  /** The item's name as shown (own language masked for a foreign record). */
  nameLocal: string | null;
  nameEn: string | null;
  /** Filled already (shown for recognizing the book, never changed). */
  currentAuthor: string | null;
  /** "isbn": found by the book's own ISBN; "title": found by title (and author). */
  source: "isbn" | "title";
  /** Same title and same author (always true for "isbn"). */
  exact: boolean;
  /** What the catalogue calls it: lets the user judge a match by title. */
  foundTitle: string | null;
  foundAuthor: string | null;
  /** Values for empty fields (absent = filled already or not found). */
  values: { author?: string; year?: number; isbn?: string; nameEn?: string };
  /** The item has no photo at all: a catalogue cover can be added, by this ISBN. */
  coverIsbn: string | null;
};

/** Answer of /api/books/fill for one item. */
export type FillAnswer = { status: "found"; proposal: FillProposal } | { status: "nothing" } | { status: "busy" };

/** What is ticked at first on the review screen. */
export function defaultTicks(p: FillProposal): (FillField | "cover")[] {
  const has = FILL_FIELDS.filter((f) => p.values[f] !== undefined);
  // By ISBN: certain. By title: at most the author and the English title of an exact match —
  // the year, ISBN and cover are those of some edition, not necessarily the user's.
  if (p.source === "isbn") return [...has, ...(p.coverIsbn ? (["cover"] as const) : [])];
  return p.exact ? has.filter((f) => f === "author" || f === "nameEn") : [];
}

/** What "Apply" changed in one item, for "Undo". */
export type FilledItem = {
  id: string;
  set: { author?: string; year?: number; isbn?: string; nameEn?: string };
  /** The item became a book only now. */
  becameBook: boolean;
  /** Storage path of an added cover. */
  cover?: string;
};
