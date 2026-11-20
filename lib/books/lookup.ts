import "server-only";
import { parseYear, toIsbn13, type BookLookup } from "./isbn";

/**
 * Book data by ISBN from public catalogues, without keys: Open Library first (good for English
 * books), then Google Books (optional GOOGLE_BOOKS_API_KEY) fills whatever is still missing (it knows Russian books better) or
 * answers alone. Only the ISBN leaves the server. Answers are cached in memory for a day.
 */

const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 1000;
const cache = new Map<string, { value: BookLookup | null; expires: number }>();

type Partial = Omit<BookLookup, "isbn">;
const EMPTY: Partial = { title: null, author: null, year: null, description: null, language: null };

/** A catalogue answered with an HTTP error; only the status is kept (never the URL: it may hold the key). */
class CatalogueError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

/** Log fields of a failed lookup: the HTTP status or the error type, nothing else. */
const failure = (error: unknown) =>
  error instanceof CatalogueError ? { status: error.status } : { error: error instanceof Error ? error.name : "unknown" };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "InventoryApp/1.0 (personal home inventory)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new CatalogueError(res.status);
  return res.json();
}

const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  // Catalogue descriptions may contain HTML: plain text only.
  const s = v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Open Library: title, authors, year. */
async function openLibrary(isbn: string): Promise<Partial | null> {
  const data = (await getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`)) as Record<
    string,
    { title?: string; authors?: { name?: string }[]; publish_date?: string }
  >;
  const book = data[`ISBN:${isbn}`];
  if (!book) return null;
  const authors = (book.authors ?? []).map((a) => a.name?.trim()).filter(Boolean);
  return {
    ...EMPTY,
    title: text(book.title, 200),
    author: authors.length ? text(authors.join(", "), 300) : null,
    year: parseYear(book.publish_date),
  };
}

/** Google Books: title, authors, year, description, language. */
async function googleBooks(isbn: string): Promise<Partial | null> {
  // Without a key Google Books shares an anonymous quota that is often used up (429);
  // GOOGLE_BOOKS_API_KEY (server only, optional) gives this app its own quota.
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  const data = (await getJson(url)) as {
    items?: {
      volumeInfo?: { title?: string; authors?: string[]; publishedDate?: string; description?: string; language?: string };
    }[];
  };
  const v = data.items?.[0]?.volumeInfo;
  if (!v) return null;
  return {
    title: text(v.title, 200),
    author: v.authors?.length ? text(v.authors.join(", "), 300) : null,
    year: parseYear(v.publishedDate),
    description: text(v.description, 2000),
    language: typeof v.language === "string" && /^[a-z]{2}$/.test(v.language) ? v.language : null,
  };
}

const filled = (p: Partial) => !!(p.title && p.author && p.year && p.description && p.language);

/** Book by a valid ISBN (normalizeIsbn), or null if neither catalogue knows it (or both fail). */
export async function lookupIsbn(isbn: string): Promise<BookLookup | null> {
  const key = toIsbn13(isbn);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let result: Partial = { ...EMPTY };
  let found = false;
  const merge = (p: Partial | null) => {
    if (!p) return;
    found ||= !!(p.title || p.author);
    for (const k of Object.keys(result) as (keyof Partial)[]) {
      if (result[k] == null && p[k] != null) result = { ...result, [k]: p[k] };
    }
  };

  let failures = 0;
  try {
    merge(await openLibrary(key));
  } catch (error) {
    failures++;
    console.error("open library lookup failed", failure(error));
  }
  if (!filled(result)) {
    try {
      merge(await googleBooks(key));
    } catch (error) {
      failures++;
      console.error("google books lookup failed", { ...failure(error), keyed: !!process.env.GOOGLE_BOOKS_API_KEY });
    }
  }

  const value = found ? { isbn, ...result } : null;
  // Do not remember "not found" when a catalogue was down: next time it may answer.
  if (failures === 0 || found) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  return value;
}
