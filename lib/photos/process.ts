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

async function processSource(source: Source): Promise<ProcessedPhoto> {
  const main = await render(source, MAIN_MAX_SIDE, MAIN_QUALITY);
  const thumb = await render(source, THUMB_MAX_SIDE, THUMB_QUALITY);
  const scale = Math.min(1, MAIN_MAX_SIDE / Math.max(source.width, source.height));
  return { main, thumb, width: Math.round(source.width * scale), height: Math.round(source.height * scale) };
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const source = await decode(file);
  try {
    return await processSource(source);
  } finally {
    source.close?.();
  }
}

/** Box from Gemini object detection: [ymin, xmin, ymax, xmax], normalized to 0–1000. */
export type Box2d = [number, number, number, number];

/** Margin around a detected box, as a share of the box size (the box is often tight). */
const CROP_PADDING = 0.06;

/** Crop rectangle in source pixels: the box plus padding, kept inside the image. */
export function cropRect(box: Box2d, width: number, height: number) {
  const [ymin, xmin, ymax, xmax] = box;
  const padX = ((xmax - xmin) / 1000) * width * CROP_PADDING;
  const padY = ((ymax - ymin) / 1000) * height * CROP_PADDING;
  const x0 = Math.max(0, Math.floor((xmin / 1000) * width - padX));
  const y0 = Math.max(0, Math.floor((ymin / 1000) * height - padY));
  const x1 = Math.min(width, Math.ceil((xmax / 1000) * width + padX));
  const y1 = Math.min(height, Math.ceil((ymax / 1000) * height + padY));
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

function cropSource(source: Source, box: Box2d): Source {
  const r = cropRect(box, source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = r.width;
  canvas.height = r.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new UnsupportedImageError("canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, r.width, r.height);
  ctx.drawImage(source.image, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return { image: canvas, width: r.width, height: r.height };
}

/**
 * A photo decoded once, for "several items in one photo": the whole picture is processed
 * as usual, and each detected box is cut from the full-resolution source (not from the
 * reduced copy) and compressed like any photo, with its thumbnail. Call close() when done.
 */
export async function openPhoto(file: File) {
  const source = await decode(file);
  return {
    process: () => processSource(source),
    crop: (box: Box2d) => processSource(cropSource(source, box)),
    close: () => source.close?.(),
  };
}
