"use client";

/**
 * SHA-256 of the original file the user picked, as lower-case hex. The same file always
 * gives the same hash, so a photo added a second time is recognized before any AI request.
 * A new shot of the same shelf is a different file (see similar items for that case).
 * Returns null where Web Crypto is unavailable (insecure context): the check is then skipped.
 */
export async function fileHash(file: Blob): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
