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
