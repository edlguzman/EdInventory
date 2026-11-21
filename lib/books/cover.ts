import "server-only";
import { googleCoverUrls } from "./lookup";
import { toIsbn13 } from "./isbn";

/**
 * Book cover by ISBN from the catalogues (Google Books imageLinks, Open Library covers), not AI.
 * The server downloads the candidates itself — only from the catalogues' hosts (every redirect
 * checked again), https only, image types by their bytes, size capped, with a timeout — and
 * keeps the one with the most pixels. The phone then compresses it like any photo.
 */

const ALLOWED_HOSTS = [
  /^books\.google\.com$/,
  /^books\.googleusercontent\.com$/,
  /^covers\.openlibrary\.org$/,
  // Open Library covers redirect to archive.org and then to one of its servers (ia800507.us.archive.org).
  /^(?:[a-z0-9-]+\.)*archive\.org$/,
];
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
/** Smaller pictures are icons or "no image" placeholders, not covers. */
const MIN_SIDE = 150;

export type CoverImage = { bytes: Uint8Array; type: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number; source: "google" | "openlibrary" };

/** The host is one of the catalogues and the address is https (no credentials, default port). */
export function isAllowedCoverUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Image type by the first bytes (never by the server's Content-Type). */
export function sniffImage(b: Uint8Array): CoverImage["type"] | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Width and height from the file header, without decoding the picture. */
export function imageSize(b: Uint8Array, type: CoverImage["type"]): { width: number; height: number } | null {
  const be16 = (i: number) => (b[i] << 8) | b[i + 1];
  const le16 = (i: number) => b[i] | (b[i + 1] << 8);
  if (type === "image/png") {
    if (b.length < 24) return null;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      // Start of frame (SOF0–SOF15, except DHT C4, JPG C8, DAC CC): height, then width.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: be16(i + 5), width: be16(i + 7) };
      }
      i += 2 + be16(i + 2);
    }
    return null;
  }
  // WebP: lossy (VP8), lossless (VP8L) or extended (VP8X).
  const chunk = String.fromCharCode(...b.slice(12, 16));
  if (chunk === "VP8 " && b.length > 30) return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
  if (chunk === "VP8L" && b.length > 25) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && b.length > 30) {
    return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

/**
 * Downloads one picture: allowed hosts only (checked again on every redirect), https, at most
 * MAX_BYTES (stops reading beyond it), a JPEG/PNG/WebP by its bytes, big enough to be a cover.
 */
export async function fetchCover(url: string, source: CoverImage["source"]): Promise<CoverImage | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isAllowedCoverUrl(current)) return null;
      const res = await fetch(current, { redirect: "manual", signal, cache: "no-store", headers: { Accept: "image/*" } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return null;
        current = new URL(next, current).toString();
        continue;
      }
      if (!res.ok || !res.body) return null;
      if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;

      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          return null;
        }
        parts.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        bytes.set(p, offset);
        offset += p.byteLength;
      }
      const type = sniffImage(bytes);
      // Google serves covers as JPEG; its "image not available" placeholder is a PNG (575x750).
      if (source === "google" && type !== "image/jpeg") return null;
      const size = type && imageSize(bytes, type);
      if (!type || !size || Math.min(size.width, size.height) < MIN_SIDE) return null;
      return { bytes, type, ...size, source };
    }
    return null;
  } catch {
    return null;
  }
}

/** The biggest cover any catalogue has for this ISBN, or null. */
export async function findCover(isbn: string): Promise<CoverImage | null> {
  const isbn13 = toIsbn13(isbn);
  const google = await googleCoverUrls(isbn13).catch(() => []);
  // Google's cover by ISBN works without the API (no key, no quota) and often finds a bigger
  // picture than the imageLinks of the search answer.
  const byIsbn = `https://books.google.com/books/content?vid=ISBN${isbn13}&printsec=frontcover&img=1&zoom=0`;
  const candidates: [string, CoverImage["source"]][] = [
    ...[byIsbn, ...google.filter((u) => u !== byIsbn)].map((u): [string, CoverImage["source"]] => [u, "google"]),
    // default=false: 404 instead of a "no cover" placeholder.
    [`https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`, "openlibrary"],
  ];
  const found = (await Promise.all(candidates.map(([u, s]) => fetchCover(u, s)))).filter((c): c is CoverImage => !!c);
  found.sort((a, b) => b.width * b.height - a.width * a.height);
  return found[0] ?? null;
}
