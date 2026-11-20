// Copies the barcode reader's wasm (zxing-wasm, used by barcode-detector in browsers without a
// native BarcodeDetector) into public/zxing/, so the app serves it itself instead of a CDN.
// Runs before dev and build (package.json "predev" / "prebuild"); public/zxing is not in git.
import fs from 'node:fs';
import path from 'node:path';
const src = path.join('node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
const dir = path.join('public', 'zxing');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'zxing_reader.wasm'));
console.log('zxing_reader.wasm copied to public/zxing/');
