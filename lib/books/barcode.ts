"use client";

import { ndcFromBarcode, type NdcScan } from "@/lib/medicines/ndc";
import { normalizeIsbn } from "./isbn";

type Detector = { detect(image: ImageBitmapSource): Promise<{ rawValue: string; format?: string }[]> };

/** Book ISBNs (EAN-13), US drug packages (UPC-A, GS1 DataMatrix with NDC and expiry). */
const FORMATS = ["ean_13", "upc_a", "data_matrix"];

let detector: Promise<Detector | null> | null = null;

/**
 * Barcode reader: the browser's own BarcodeDetector where it reads all our formats (Chrome on
 * Android), else the zxing-wasm ponyfill, loaded only when first needed (Safari). Its wasm file
 * is served by this app (/zxing/, copied from node_modules by scripts/copy-zxing.mjs), not a CDN.
 */
function getDetector(): Promise<Detector | null> {
  detector ??= (async () => {
    try {
      const native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
        .BarcodeDetector;
      const supported = native ? ((await native.getSupportedFormats?.()) ?? []) : [];
      if (native && FORMATS.every((f) => supported.includes(f))) return new native({ formats: FORMATS });
      const { BarcodeDetector, setZXingModuleOverrides } = await import("barcode-detector/ponyfill");
      setZXingModuleOverrides({
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path),
      });
      return new BarcodeDetector({ formats: FORMATS as never }) as Detector;
    } catch {
      return null;
    }
  })();
  return detector;
}

export type BarcodeScan = { isbn: string | null; ndc: NdcScan | null };

/**
 * Every barcode we understand on the photo: a book ISBN (EAN-13 978/979, valid checksum) and a
 * US drug NDC (UPC-A or GS1 DataMatrix; the DataMatrix also gives the expiry date).
 * Free and local: no AI request, the photo does not leave the phone. Never throws.
 */
export async function scanBarcodes(image: Blob): Promise<BarcodeScan> {
  const none: BarcodeScan = { isbn: null, ndc: null };
  try {
    const d = await getDetector();
    if (!d) return none;
    const bitmap = await createImageBitmap(image);
    try {
      const codes = await d.detect(bitmap);
      const result: BarcodeScan = { isbn: null, ndc: null };
      for (const c of codes) {
        const isbn = normalizeIsbn(c.rawValue);
        if (!result.isbn && isbn && /^97[89]/.test(isbn)) result.isbn = isbn;
        const ndc = ndcFromBarcode(c.rawValue);
        // A DataMatrix (with the expiry) beats a plain UPC of the same package.
        if (ndc && (!result.ndc || (!result.ndc.expiry && ndc.expiry))) result.ndc = ndc;
      }
      return result;
    } finally {
      bitmap.close();
    }
  } catch {
    return none;
  }
}

/** An ISBN barcode on the photo, or null (see scanBarcodes). */
export async function findIsbnBarcode(image: Blob): Promise<string | null> {
  return (await scanBarcodes(image)).isbn;
}
