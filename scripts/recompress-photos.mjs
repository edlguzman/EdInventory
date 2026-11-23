#!/usr/bin/env node
// One-off: recompress photos already in Storage to the 2.2.0 sizes (main: long side 1280px,
// <= 180 KB; thumbnail: 480px, <= 35 KB). Run on the developer's computer, never on Vercel.
//
//   node scripts/recompress-photos.mjs --user <uuid> --dry-run            what it would do
//   node scripts/recompress-photos.mjs --user <uuid> --confirm            one account (test first)
//   node scripts/recompress-photos.mjs --all --confirm                    every account (after the owner's "yes")
//   options: --backup <dir>  local copy of the bucket made right before (read instead of downloading
//                            when the size matches); --work <dir> (default backups/recompress)
//
// Access goes through the Supabase CLI and the developer's own login (as for backups): no keys in
// this file, in .env or in logs. --confirm lets the CLI change production (its --yes).
//
// The Storage CLI cannot overwrite a file, so every photo (a row of item_photos = main file +
// thumbnail) moves to a new name in the same folder, in three steps recorded in <work>/state.json:
//   1 uploaded  new pair uploaded and checked (size in Storage); the row still points to the old pair
//   2 db        update item_photos set storage_path = new where storage_path = old (only that row,
//               only if it still has the old path; otherwise the new files are removed: "skipped")
//   3 done      old pair removed
// A stop at any moment leaves the row pointing to a complete pair (old or new); a new run continues
// from the recorded step. source_hash and every other column stay as they are.

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAIN = { side: 1280, maxBytes: 180 * 1024, qualities: [82, 72, 62, 52] };
const THUMB = { side: 480, maxBytes: 35 * 1024, qualities: [72, 62, 52] };
const BUCKET = "item-photos";
const BATCH = 40;

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const user = arg("--user");
const all = args.includes("--all");
const dryRun = args.includes("--dry-run");
const confirm = args.includes("--confirm");
const backupDir = arg("--backup");
// Testing resumability: stop right after this step of the first batch, as if interrupted.
const stopAfter = arg("--stop-after");
const stop = (step) => {
  if (stopAfter === step) {
    console.log(`stopped after "${step}" (--stop-after)`);
    process.exit(3);
  }
};
const work = path.resolve(arg("--work") ?? "backups/recompress");
if (!!user === all || (user && !/^[0-9a-f-]{36}$/.test(user))) {
  console.error("Use --user <uuid> or --all");
  process.exit(2);
}
if (!dryRun && !confirm) {
  console.error("A real run changes production Storage and item_photos: add --confirm (or use --dry-run).");
  process.exit(2);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const cli = (cliArgs) =>
  execFileSync(npx, ["supabase", ...cliArgs], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
const yes = confirm ? ["--yes"] : [];
/** A local path the CLI understands: relative, forward slashes ("c:\..." looks like a URL scheme). */
const local = (p) => path.relative(process.cwd(), p).split(path.sep).join("/");
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const thumbOf = (p) => p.replace(/\.jpg$/, ".thumb.jpg");

fs.mkdirSync(work, { recursive: true });
/** SQL through the CLI (read-only unless `write`); returns the rows. */
function query(sql, write = false) {
  const file = path.join(work, "query.sql");
  fs.writeFileSync(file, sql);
  const out = cli(["db", "query", "--remote", ...(write ? yes : ["--read-only"]), "-f", local(file)]);
  return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
}

const statePath = path.join(work, "state.json");
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { pairs: {} };
const saveState = () => {
  if (dryRun) return;
  // Write, then rename: the journal itself is never half-written.
  fs.writeFileSync(statePath + ".tmp", JSON.stringify(state, null, 1));
  fs.renameSync(statePath + ".tmp", statePath);
};

/** Down the quality ladder until it fits; null if it would not get smaller than `input`. */
async function recompress(input, target) {
  const img = sharp(input, { failOn: "error" }).rotate().resize({ width: target.side, height: target.side, fit: "inside", withoutEnlargement: true });
  const pixels = await img.raw().toBuffer({ resolveWithObject: true });
  let best = null;
  for (const quality of target.qualities) {
    const data = await sharp(pixels.data, { raw: pixels.info }).jpeg({ quality, mozjpeg: true }).toBuffer();
    best = { data, quality };
    if (data.length <= target.maxBytes) break;
  }
  if (best.data.length >= input.length) return null;
  const check = await sharp(best.data).metadata();
  if (check.format !== "jpeg" || check.width !== pixels.info.width || check.height !== pixels.info.height) throw new Error("verify failed");
  return { ...best, size: `${check.width}x${check.height}` };
}

/** The current file: from the backup when its size is the same, else downloaded. */
function readFile(name, size) {
  const fromBackup = backupDir && path.join(backupDir, name);
  if (fromBackup && fs.existsSync(fromBackup) && fs.statSync(fromBackup).size === size) return fs.readFileSync(fromBackup);
  const file = path.join(work, "download", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  cli(["storage", "cp", "--remote", "--experimental", `ss:///${BUCKET}/${name}`, local(file)]);
  const data = fs.readFileSync(file);
  if (data.length !== size) throw new Error(`downloaded size differs: ${name}`);
  return data;
}

const filesDir = path.join(work, "files");
const newFile = (name) => path.join(filesDir, name);

function sizesOf(names) {
  if (names.length === 0) return new Map();
  const rows = query(
    `select name, (metadata->>'size')::bigint as size from storage.objects where bucket_id = '${BUCKET}' and name in (${names.map(q).join(",")})`,
  );
  return new Map(rows.map((r) => [r.name, Number(r.size)]));
}

function upload(name) {
  try {
    cli(["storage", "cp", "--remote", "--experimental", ...yes, "--content-type", "image/jpeg", "--cache-control", "max-age=3600", local(newFile(name)), `ss:///${BUCKET}/${name}`]);
  } catch (e) {
    // Uploaded by an earlier, interrupted run: fine if it is the same file (checked by size below).
    if (!String(e.stdout ?? "").includes("KeyAlreadyExists")) throw e;
  }
}

function remove(names) {
  // A few at a time: the Windows command line has a length limit.
  for (let i = 0; i < names.length; i += 20) {
    cli(["storage", "rm", "--remote", "--experimental", ...yes, ...names.slice(i, i + 20).map((n) => `ss:///${BUCKET}/${n}`)]);
  }
}

// --- Photos (rows) and their file sizes.
const scope = user ? `and p.user_id = ${q(user)}` : "";
const rows = query(`select p.storage_path,
    (select (metadata->>'size')::bigint from storage.objects o where o.bucket_id = '${BUCKET}' and o.name = p.storage_path) as main_size,
    (select (metadata->>'size')::bigint from storage.objects o where o.bucket_id = '${BUCKET}' and o.name = replace(p.storage_path, '.jpg', '.thumb.jpg')) as thumb_size
  from public.item_photos p where true ${scope} order by p.storage_path`).map((r) => ({
  path: r.storage_path,
  main: Number(r.main_size ?? 0),
  thumb: Number(r.thumb_size ?? 0),
}));
const total = rows.reduce((s, r) => s + r.main + r.thumb, 0);
// Rows already moved by this run point to their new path: those are recognised by the journal.
const movedTo = new Set(Object.values(state.pairs).map((p) => p.new));
const todo = rows.filter((r) => {
  if (movedTo.has(r.path)) return false;
  const st = state.pairs[r.path];
  if (st && (st.status === "done" || st.status === "skipped")) return false;
  if (st) return true; // in progress: continue
  return r.main > 0 && r.thumb > 0 && (r.main > MAIN.maxBytes || r.thumb > THUMB.maxBytes);
});
// Unfinished journal entries are finished even when their old path is no longer a row (step 2
// already moved it, step 3 did not run).
for (const [old, p] of Object.entries(state.pairs)) {
  if (["planned", "uploaded", "db"].includes(p.status) && !todo.some((t) => t.path === old)) todo.push({ path: old, main: 0, thumb: 0 });
}
console.log(
  `${user ? `account ${user}` : "all accounts"}: ${rows.length} photos, ${(total / 1048576).toFixed(1)} MB; to move: ${todo.length}${dryRun ? " (dry run)" : ""}`,
);

const examples = [];
let saved = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);

  // Step 0: new files prepared locally (kept until done, so an interrupted upload can be repeated).
  for (const r of batch) {
    if (state.pairs[r.path]) continue;
    const mainIn = readFile(r.path, r.main);
    const thumbIn = readFile(thumbOf(r.path), r.thumb);
    const main = r.main > MAIN.maxBytes ? await recompress(mainIn, MAIN) : null;
    const thumb = r.thumb > THUMB.maxBytes ? await recompress(thumbIn, THUMB) : null;
    if (!main && !thumb) {
      state.pairs[r.path] = { status: "skipped", reason: "not smaller" };
      continue;
    }
    const next = path.posix.join(path.posix.dirname(r.path), `${randomUUID()}.jpg`);
    const pair = {
      status: "planned",
      new: next,
      before: r.main + r.thumb,
      main: main ? main.data.length : r.main,
      thumb: thumb ? thumb.data.length : r.thumb,
      quality: main?.quality ?? null,
      from: Math.round(r.main / 1024),
      size: main?.size ?? null,
    };
    if (!dryRun) {
      fs.mkdirSync(path.dirname(newFile(next)), { recursive: true });
      fs.writeFileSync(newFile(next), main ? main.data : mainIn);
      fs.writeFileSync(newFile(thumbOf(next)), thumb ? thumb.data : thumbIn);
    }
    state.pairs[r.path] = pair;
    if (examples.length < 4 && main) examples.push({ old: r.path, ...pair });
  }
  saveState();
  const pending = batch.map((r) => [r.path, state.pairs[r.path]]).filter(([, p]) => p && p.status !== "skipped" && p.status !== "done");
  if (dryRun) {
    for (const [, p] of pending) saved += p.before - p.main - p.thumb;
    console.log(`batch ${i / BATCH + 1}: ${pending.length} would move`);
    continue;
  }

  // Step 1: upload the new pairs, then check them in Storage.
  for (const [, p] of pending.filter(([, p]) => p.status === "planned")) {
    upload(p.new);
    upload(thumbOf(p.new));
  }
  const sizes = sizesOf(pending.flatMap(([, p]) => [p.new, thumbOf(p.new)]));
  for (const [, p] of pending) {
    if (p.status !== "planned") continue;
    if (sizes.get(p.new) !== p.main || sizes.get(thumbOf(p.new)) !== p.thumb) throw new Error(`upload check failed: ${p.new}`);
    p.status = "uploaded";
  }
  saveState();
  stop("uploaded");

  // Step 2: point each row to its new pair, only where it still has the old path.
  const toDb = pending.filter(([, p]) => p.status === "uploaded");
  if (toDb.length) {
    const values = toDb.map(([old, p]) => `(${q(old)}, ${q(p.new)})`).join(",");
    query(`update public.item_photos p set storage_path = v.new_path from (values ${values}) as v(old_path, new_path) where p.storage_path = v.old_path`, true);
    // What the rows hold now (also covers an update that ran before an interruption).
    const now = new Set(query(`select storage_path from public.item_photos where storage_path in (${toDb.map(([, p]) => q(p.new)).join(",")})`).map((r) => r.storage_path));
    const gone = [];
    for (const [, p] of toDb) {
      if (now.has(p.new)) p.status = "db";
      else {
        // The row was deleted or changed meanwhile: our new files are not used by anything.
        p.status = "skipped";
        p.reason = "row changed";
        gone.push(p.new, thumbOf(p.new));
      }
    }
    remove(gone);
    saveState();
    stop("db");
  }

  // Step 3: remove the old pairs (no row points to them any more).
  const toRemove = pending.filter(([, p]) => p.status === "db");
  const oldNames = toRemove.flatMap(([old]) => [old, thumbOf(old)]);
  const stillUsed = oldNames.length
    ? new Set(query(`select storage_path from public.item_photos where storage_path in (${toRemove.map(([old]) => q(old)).join(",")})`).map((r) => r.storage_path))
    : new Set();
  if (stillUsed.size) throw new Error(`old path still in item_photos: ${[...stillUsed][0]}`);
  const existing = sizesOf(oldNames);
  remove(oldNames.filter((n) => existing.has(n)));
  for (const [, p] of toRemove) {
    p.status = "done";
    saved += p.before - p.main - p.thumb;
    fs.rmSync(newFile(p.new), { force: true });
    fs.rmSync(newFile(thumbOf(p.new)), { force: true });
  }
  saveState();
  console.log(`batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)}: ${toRemove.length} moved, ${pending.filter(([, p]) => p.status === "skipped").length} skipped`);
}

console.log(`before ${(total / 1048576).toFixed(1)} MB; ${dryRun ? "would save" : "saved"} ${(saved / 1048576).toFixed(1)} MB`);
for (const e of examples) console.log(`  ${e.old} -> ${e.new}: ${e.from} KB -> ${Math.round(e.main / 1024)} KB ${e.size} (q${e.quality})`);
