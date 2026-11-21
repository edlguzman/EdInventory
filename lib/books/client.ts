"use client";

import type { BookLookup } from "./isbn";

export type BookLookupError = "badRequest" | "unauthorized" | "accountInactive" | "rateLimited" | "network";

/** Book data by ISBN (server: Open Library, then Google Books). null = not found anywhere. */
export async function lookupBook(isbn: string): Promise<{ book: BookLookup | null } | { error: BookLookupError }> {
  try {
    const res = await fetch("/api/books/isbn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn }),
    });
    const data = (await res.json().catch(() => null)) as { book?: BookLookup | null; error?: BookLookupError } | null;
    if (!res.ok || !data) return { error: data?.error ?? "network" };
    return { book: data.book ?? null };
  } catch {
    return { error: "network" };
  }
}

/** The biggest catalogue cover for this ISBN (checked and downloaded by the server). Not AI. */
export async function fetchCoverImage(
  isbn: string,
): Promise<{ blob: Blob; source: "google" | "openlibrary" } | { notFound: true } | { error: BookLookupError }> {
  try {
    const res = await fetch("/api/books/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isbn }),
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: BookLookupError } | null;
      return { error: data?.error ?? "network" };
    }
    const source = res.headers.get("X-Cover-Source") === "google" ? "google" : "openlibrary";
    return { blob: await res.blob(), source };
  } catch {
    return { error: "network" };
  }
}
