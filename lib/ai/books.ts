import "server-only";
import type { Lang } from "@/lib/languages";
import { BOOK_AUTHOR_MAX, normalizeIsbn, parseYear, type BookInfo } from "@/lib/books/isbn";

/**
 * Prompt lines for books, shared by single and multi recognition. The title in the user's
 * language field is never translated: it goes as printed; name_en gets the established English
 * title of the work if the model is sure of one (English users have only name_en: that title,
 * else the printed one).
 */
export function bookRules(lang: Lang) {
  const title =
    lang === "en"
      ? ["name_en = the established English title of this work if you are sure one exists (a well-known translated book),",
         "otherwise its title exactly as printed on the cover or spine, in the original language and script;",
         'name_local = "".']
      : ["name_local = its title exactly as printed on the cover or spine, in the original language and script (never translate it);",
         "name_en = the established English title of this work only if you are sure one exists (a well-known translated book),",
         "otherwise the same text as name_local."];
  return [
    "BOOKS: if an item is a book (also a booklet, magazine or comic): is_book = true;",
    ...title,
    'book_author = the author(s) as printed, comma-separated, "" if none is visible;',
    'book_year = the publication year only if it is printed on what is visible, else "";',
    'book_isbn = the ISBN digits only if an ISBN is printed and readable, else "";',
    "description = what the book is (genre or topic, notable edition details), in each language as usual; tags = genre/topic words.",
    'Not a book: is_book = false and every book_* field "".',
  ].join("\n");
}

/** Model answer fields for a book -> BookInfo (null = not a book). */
export function cleanBook(r: { is_book: boolean; book_author: string; book_year: string; book_isbn: string }): BookInfo | null {
  if (!r.is_book) return null;
  const author = r.book_author.trim().slice(0, BOOK_AUTHOR_MAX) || null;
  return { author, year: parseYear(r.book_year), isbn: normalizeIsbn(r.book_isbn) };
}
