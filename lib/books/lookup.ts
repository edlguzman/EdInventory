import "server-only";
import { normalizeIsbn, parseYear, toIsbn13, type BookLookup } from "./isbn";
import type { BookCandidate } from "./match";

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

type Partial = Omit<BookLookup, "isbn" | "titleEn">;
const EMPTY: Partial = { title: null, author: null, year: null, description: null, language: null };

/**
 * ISBN groups of English-language publishing (978-0, 978-1, 979-8): a book there with no
 * language from the catalogues is taken as English (Open Library's answer has no language).
 */
const ENGLISH_GROUP_PREFIXES = ["9780", "9781", "9798"];

/**
 * English title: the book's own title when it is in English. The catalogues give only the
 * title of this edition, so a translated book gets null (the user's language field keeps the
 * printed title; English is filled in by the usual translation).
 */
function englishTitle(p: Partial, isbn13: string): string | null {
  const language = p.language ?? (ENGLISH_GROUP_PREFIXES.some((g) => isbn13.startsWith(g)) ? "en" : null);
  return language === "en" ? p.title : null;
}

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
  return (await lookupIsbnStatus(isbn)).book;
}

/** The same, telling "not known" from "a catalogue did not answer" (busy: worth asking again later). */
export async function lookupIsbnStatus(isbn: string): Promise<{ book: BookLookup | null; busy: boolean }> {
  const key = toIsbn13(isbn);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return { book: hit.value, busy: false };

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

  const value: BookLookup | null = found ? { isbn, ...result, titleEn: englishTitle(result, key) } : null;
  // Do not remember "not found" when a catalogue was down: next time it may answer.
  if (failures === 0 || found) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }
  return { book: value, busy: failures > 0 && !(value?.author && value.year) };
}

/**
 * Google Books by title and author (a book without an ISBN): up to 5 candidates. First exactly
 * (intitle / inauthor), then, if that finds nothing, as plain words. Only the title and the
 * author leave the server. busy: the catalogue did not answer (limit, error, timeout).
 */
export async function searchByTitle(title: string, author: string | null): Promise<{ candidates: BookCandidate[]; busy: boolean }> {
  const clean = (s: string) => s.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const t = clean(title);
  const a = author ? clean(author.split(/[,;]/)[0]) : "";
  const queries = [`intitle:"${t}"${a ? ` inauthor:"${a}"` : ""}`, [t, a].filter(Boolean).join(" ")];
  const key = process.env.GOOGLE_BOOKS_API_KEY;
  try {
    for (const q of queries) {
      const data = (await getJson(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books${key ? `&key=${encodeURIComponent(key)}` : ""}`,
      )) as { items?: { volumeInfo?: GoogleVolume }[] };
      const candidates = (data.items ?? []).flatMap((i) => toCandidate(i.volumeInfo));
      if (candidates.length) return { candidates, busy: false };
    }
    return { candidates: [], busy: false };
  } catch (error) {
    console.error("google books title search failed", { ...failure(error), keyed: !!key });
    // A refused query (4xx other than the limit) will not get better by asking again.
    const refused = error instanceof CatalogueError && error.status >= 400 && error.status < 500 && ![403, 408, 429].includes(error.status);
    return { candidates: [], busy: !refused };
  }
}

type GoogleVolume = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publishedDate?: string;
  language?: string;
  industryIdentifiers?: { type?: string; identifier?: string }[];
};

function toCandidate(v: GoogleVolume | undefined): BookCandidate[] {
  const title = text(v?.title, 200);
  if (!v || !title) return [];
  const id = (type: string) => v.industryIdentifiers?.find((x) => x.type === type)?.identifier;
  return [
    {
      title,
      subtitle: text(v.subtitle, 200),
      authors: (v.authors ?? []).flatMap((x) => text(x, 120) ?? []),
      year: parseYear(v.publishedDate),
      isbn: normalizeIsbn(id("ISBN_13") ?? id("ISBN_10")),
      language: typeof v.language === "string" ? v.language : null,
    },
  ];
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
