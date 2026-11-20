/** ISBN helpers shared by the client (barcode, form) and the server (AI answers, lookup). */

/** Digits of an ISBN as typed or read ("978-5-17-087836-9", "0 8044 2957 x"); X only as the last ISBN-10 char. */
export function isbnDigits(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9X]/g, "");
}

function validIsbn10(s: string) {
  if (!/^[0-9]{9}[0-9X]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

function validIsbn13(s: string) {
  if (!/^97[89][0-9]{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

/** A valid ISBN-10/13 in stored form (digits, X), or null. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = isbnDigits(raw);
  return validIsbn13(s) || validIsbn10(s) ? s : null;
}

/** ISBN-13 for lookups (ISBN-10 converted: 978 prefix + new check digit). */
export function toIsbn13(isbn: string): string {
  if (isbn.length === 13) return isbn;
  const core = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 ? 3 : 1);
  return core + String((10 - (sum % 10)) % 10);
}

/** Display form: ISBN-13 as "978-517087836-9" (prefix, body, check digit); ISBN-10 as stored. */
export function formatIsbn(isbn: string): string {
  return isbn.length === 13 ? `${isbn.slice(0, 3)}-${isbn.slice(3, 12)}-${isbn.slice(12)}` : isbn;
}

export const BOOK_AUTHOR_MAX = 300;
export const BOOK_YEAR_MIN = 1400;
export const BOOK_YEAR_MAX = 2100;

/** A year as written ("1967", "1967 г.") within the stored range, or null. */
export function parseYear(raw: string | number | null | undefined): number | null {
  const m = String(raw ?? "").match(/\b(1[4-9][0-9]{2}|20[0-9]{2}|2100)\b/);
  const y = m ? Number(m[1]) : NaN;
  return y >= BOOK_YEAR_MIN && y <= BOOK_YEAR_MAX ? y : null;
}

/** Book fields of an item (language-neutral). */
export type BookInfo = { author: string | null; year: number | null; isbn: string | null };

/** What a lookup by ISBN found (Open Library, missing fields from Google Books). */
export type BookLookup = {
  isbn: string;
  title: string | null;
  author: string | null;
  year: number | null;
  description: string | null;
  /** Language of the book (ISO 639-1, e.g. "ru", "en"), if known. */
  language: string | null;
};

/** Names of a "Books" category in any case/language: the one a book goes to. */
export function isBooksCategoryName(name: string | null | undefined): boolean {
  return /^(книги|книга|books?)$/i.test((name ?? "").trim());
}
