import "server-only";
import { parseYear, toIsbn13, type BookLookup } from "./isbn";

/**
 * Book data by ISBN from public catalogues: Open Library first (good for English books), then
 * Google Books (optional GOOGLE_BOOKS_API_KEY) fills whatever is still missing; for Russian-language
 * ISBN groups the order is reversed (catalogueOrder). Only the ISBN leaves the server. Answers
 * are cached in memory for a day.
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
/** Cover picture addresses Google Books gave for an ISBN-13 (biggest first), kept for a day. */
const googleCovers = new Map<string, { urls: string[]; expires: number }>();

/** imageLinks -> https addresses, biggest size first ("edge=curl" draws a page curl: dropped). */
function coverLinks(links: Record<string, unknown> | undefined): string[] {
  const order = ["extraLarge", "large", "medium", "small", "thumbnail"];
  const best = order.map((k) => links?.[k]).find((v): v is string => typeof v === "string");
  if (!best) return [];
  const url = best.replace(/^http:\/\//, "https://").replace(/&edge=curl/, "");
  // zoom=0 often gives a bigger picture than the zoom=1 thumbnail; both are tried, the bigger wins.
  return url.includes("zoom=1") ? [url.replace("zoom=1", "zoom=0"), url] : [url];
}

async function googleBooks(isbn: string): Promise<Partial | null> {
  // Without a key Google Books shares an anonymous quota that is often used up (429);
  // GOOGLE_BOOKS_API_KEY (server only, optional) gives this app its own quota.
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${key ? `&key=${encodeURIComponent(key)}` : ""}`;
  const data = (await getJson(url)) as {
    items?: {
      volumeInfo?: {
        title?: string;
        authors?: string[];
        publishedDate?: string;
        description?: string;
        language?: string;
        imageLinks?: Record<string, unknown>;
      };
    }[];
  };
  const v = data.items?.[0]?.volumeInfo;
  if (googleCovers.size >= CACHE_MAX) googleCovers.clear();
  googleCovers.set(isbn, { urls: coverLinks(v?.imageLinks), expires: Date.now() + CACHE_TTL_MS });
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

/**
 * ISBN registration groups of Russian-language publishing (978-5: Russia and the former USSR;
 * 978-985 Belarus; 978-966 Ukraine; 978-601 Kazakhstan). Open Library knows these books badly
 * (wrong authors, transliterated titles), Google Books much better: for them Google answers first.
 */
const GOOGLE_FIRST_PREFIXES = ["9785", "978985", "978966", "978601"];

type Source = { name: "open library" | "google books"; fetch: (isbn13: string) => Promise<Partial | null> };
const OPEN_LIBRARY: Source = { name: "open library", fetch: openLibrary };
const GOOGLE_BOOKS: Source = { name: "google books", fetch: googleBooks };

/** Which catalogue answers first for this ISBN-13 (the other one only fills missing fields). */
export function catalogueOrder(isbn13: string): Source["name"][] {
  return GOOGLE_FIRST_PREFIXES.some((p) => isbn13.startsWith(p)) ? ["google books", "open library"] : ["open library", "google books"];
}

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
  for (const name of catalogueOrder(key)) {
    if (filled(result)) break;
    const source = name === "google books" ? GOOGLE_BOOKS : OPEN_LIBRARY;
    try {
      merge(await source.fetch(key));
    } catch (error) {
      failures++;
      const extra = name === "google books" ? { keyed: !!process.env.GOOGLE_BOOKS_API_KEY } : {};
      console.error(`${name} lookup failed`, { ...failure(error), ...extra });
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

/** Google Books cover addresses for an ISBN-13 (from the lookup's answer, or one more request). */
export async function googleCoverUrls(isbn13: string): Promise<string[]> {
  const hit = googleCovers.get(isbn13);
  if (hit && hit.expires > Date.now()) return hit.urls;
  try {
    await googleBooks(isbn13);
  } catch (error) {
    console.error("google books cover lookup failed", { ...failure(error), keyed: !!process.env.GOOGLE_BOOKS_API_KEY });
  }
  return googleCovers.get(isbn13)?.urls ?? [];
}
