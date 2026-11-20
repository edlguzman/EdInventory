import "server-only";
import { BOOK_AUTHOR_MAX, normalizeIsbn, parseYear, type BookInfo } from "@/lib/books/isbn";

/** Prompt lines for books, shared by single and multi recognition. */
export const BOOK_RULES = [
  "BOOKS: if an item is a book (also a booklet, magazine or comic): is_book = true;",
  "name_ru and name_en = its title exactly as printed on the cover or spine, in the original language and script, the same text in both",
  "fields (never translate a title; in English-only mode put it into name_en);",
  "book_author = the author(s) as printed, comma-separated, \"\" if none is visible;",
  "book_year = the publication year only if it is printed on what is visible, else \"\";",
  "book_isbn = the ISBN digits only if an ISBN is printed and readable, else \"\";",
  "description = what the book is (genre or topic, notable edition details), in each language as usual; tags = genre/topic words.",
  "Not a book: is_book = false and every book_* field \"\".",
].join("\n");

/** Model answer fields for a book -> BookInfo (null = not a book). */
export function cleanBook(r: { is_book: boolean; book_author: string; book_year: string; book_isbn: string }): BookInfo | null {
  if (!r.is_book) return null;
  const author = r.book_author.trim().slice(0, BOOK_AUTHOR_MAX) || null;
  return { author, year: parseYear(r.book_year), isbn: normalizeIsbn(r.book_isbn) };
}
