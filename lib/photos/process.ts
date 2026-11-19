"use client";

/**
 * Client-side photo processing before upload (CLAUDE.md):
 * main: long side up to 1600px, JPEG ~80%; thumbnail: long side 480px, JPEG ~75%.
 *
 * Orientation: browsers apply EXIF orientation when decoding into <img> / ImageBitmap
 * (image-orientation: from-image is the default), so the canvas gets an upright image.
 * Re-encoding through canvas drops all metadata, including GPS from the camera.
 *
 * HEIC: iPhone Safari usually hands over JPEG for accept="image/*", and Safari 17+
 * decodes HEIC itself. Only when the browser cannot decode a HEIC file is the
 * WebAssembly decoder (heic-to, ~3 MB) loaded.
 */

export const MAIN_MAX_SIDE = 1600;
export const MAIN_QUALITY = 0.8;
export const THUMB_MAX_SIDE = 480;
export const THUMB_QUALITY = 0.75;

export class UnsupportedImageError extends Error {}

export type ProcessedPhoto = { main: Blob; thumb: Blob; width: number; height: number };

type Source = { image: CanvasImageSource; width: number; height: number; close?: () => void };

function looksLikeHeic(file: File) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function decodeWithImg(file: Blob): Promise<Source> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!img.naturalWidth || !img.naturalHeight) throw new UnsupportedImageError("empty image");
  return { image: img, width: img.naturalWidth, height: img.naturalHeight };
}

async function decodeHeic(file: File): Promise<Source> {
  const { heicTo } = await import("heic-to");
  // libheif applies the HEIF rotation/mirror transforms itself.
  const bitmap = await heicTo({ blob: file, type: "bitmap" });
  return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
}

async function decode(file: File): Promise<Source> {
  try {
    return await decodeWithImg(file);
  } catch (error) {
    if (looksLikeHeic(file) || (await import("heic-to").then((m) => m.isHeic(file)).catch(() => false))) {
      try {
        return await decodeHeic(file);
      } catch {
        throw new UnsupportedImageError("HEIC could not be decoded");
      }
    }
    throw error instanceof UnsupportedImageError ? error : new UnsupportedImageError("cannot decode image");
  }
}

function render(source: Source, maxSide: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UnsupportedImageError("canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // White background: transparent PNGs would otherwise turn black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source.image, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new UnsupportedImageError("encode failed"))), "image/jpeg", quality),
  );
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const source = await decode(file);
  try {
    const main = await render(source, MAIN_MAX_SIDE, MAIN_QUALITY);
    const thumb = await render(source, THUMB_MAX_SIDE, THUMB_QUALITY);
    const scale = Math.min(1, MAIN_MAX_SIDE / Math.max(source.width, source.height));
    return { main, thumb, width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
  } finally {
    source.close?.();
  }
}
