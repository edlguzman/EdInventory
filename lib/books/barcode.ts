"use client";

import { normalizeIsbn } from "./isbn";

type Detector = { detect(image: ImageBitmapSource): Promise<{ rawValue: string }[]> };

let detector: Promise<Detector | null> | null = null;

/**
 * EAN-13 reader: the browser's own BarcodeDetector where it exists (Chrome on Android), else
 * the zxing-wasm ponyfill, loaded only when first needed (Safari). Its wasm file is served by
 * this app (/zxing/, copied from node_modules by scripts/copy-zxing.mjs), not from a CDN.
 */
function getDetector(): Promise<Detector | null> {
  detector ??= (async () => {
    try {
      const native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
        .BarcodeDetector;
      if (native && (await native.getSupportedFormats?.())?.includes("ean_13")) return new native({ formats: ["ean_13"] });
      const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
      setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path),
      });
      return new BarcodeDetector({ formats: ["ean_13"] }) as Detector;
    } catch {
      return null;
    }
  })();
  return detector;
}

/**
 * An ISBN barcode on the photo (EAN-13 starting with 978/979, valid checksum), or null.
 * Free and local: no AI request, the photo does not leave the phone. Never throws.
 */
export async function findIsbnBarcode(image: Blob): Promise<string | null> {
  try {
    const d = await getDetector();
    if (!d) return null;
    const bitmap = await createImageBitmap(image);
    try {
      const codes = await d.detect(bitmap);
      for (const c of codes) {
        const isbn = normalizeIsbn(c.rawValue);
        if (isbn && /^97[89]/.test(isbn)) return isbn;
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
