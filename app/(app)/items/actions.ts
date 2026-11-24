"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDataLang, getUser } from "@/lib/auth";
import { getMyPlan } from "@/lib/plans";
import { isForeign, ownLocal, type DataLang } from "@/lib/data-lang";
import {
  maskMedicineAttrs,
  medicineInputSchema,
  readMedicineAttrs,
  toMedicineRow,
  type MedicineAttrs,
  type MedicineInput,
} from "@/lib/medicines/attrs";
import type { Json } from "@/lib/supabase/database.types";
import { dataErrorKey, type DataErrorKey } from "@/lib/db-errors";
import { isOwnPhotoPath, MAX_PHOTOS, PHOTO_BUCKET, photoFiles, photoPath, thumbPath } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import { photoHashSchema } from "@/lib/validation/photo-hash";
import { translateAfterSave } from "@/lib/translate/after-save";
import {
  itemFieldsSchema,
  itemRefsSchema,
  MAX_BATCH_ITEMS,
  newPhotosSchema,
  toItemRow,
  type ItemFieldsInput,
  type ItemTextRow,
} from "@/lib/validation/items";

export type ItemErrorKey =
  | DataErrorKey
  | "descriptionTooLong"
  | "tagTooLong"
  | "tooManyTags"
  | "authorTooLong"
  | "yearInvalid"
  | "isbnInvalid"
  | "medicineTooLong"
  | "expiryInvalid"
  | "ndcInvalid"
  | "photoTooMany"
  | "photoInvalid"
  | "photoUpload"
  | "unauthorized";

export type ItemResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ItemErrorKey };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const uuid = z.uuid();
const fail = (error: ItemErrorKey): { ok: false; error: ItemErrorKey } => ({ ok: false, error });

function firstIssue(error: z.ZodError): ItemErrorKey {
  const key = error.issues[0]?.message;
  const known: ItemErrorKey[] = [
    "nameRequired",
    "nameTooLong",
    "descriptionTooLong",
    "tagTooLong",
    "tooManyTags",
    "authorTooLong",
    "yearInvalid",
    "isbnInvalid",
    "medicineTooLong",
    "expiryInvalid",
    "ndcInvalid",
    "photoTooMany",
  ];
  return known.includes(key as ItemErrorKey) ? (key as ItemErrorKey) : "unknown";
}

/** Removes main + thumbnail files. Best effort: a leftover file is invisible, a broken item is not. */
async function removePhotoFiles(supabase: Supabase, mainPaths: string[]) {
  if (mainPaths.length === 0) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(mainPaths.flatMap(photoFiles));
  if (error) console.error("photo files not removed", { count: mainPaths.length, message: error.message });
}

/** Source-file hash for a photo path (duplicate check); anything malformed becomes null. */
function hashFor(hashes: Record<string, string> | undefined, path: string): string | null {
  const value = hashes && typeof hashes === "object" ? hashes[path] : undefined;
  return photoHashSchema.safeParse(value).success ? (value as string) : null;
}

/** Item counts change the tree, the header and the lists: refresh the whole (app) layout. */
function refresh() {
  revalidatePath("/", "layout");
}

type SaveInput = {
  fields: ItemFieldsInput;
  category_id: string | null;
  location_id: string | null;
  /** Medicine / supplement block: an object = it is one; null = it is not; absent = unchanged. */
  medicine?: MedicineInput | null;
};

/** What is stored of the item's type (for an edit; null for a new item). */
type StoredKind = { kind: string; attrs: MedicineAttrs | null; masked: MedicineAttrs | null };

/**
 * Item type columns: kind, attrs and expires_on. A medicine block makes it a medicine (attrs by
 * the language rules, see toMedicineRow); without one it is a book when it has book data, else
 * a plain item. Absent `medicine` (callers that do not know it) leaves a medicine as it is.
 */
function kindColumns(
  input: SaveInput,
  fields: z.output<ReturnType<typeof itemFieldsSchema>>,
  d: DataLang,
  stored: StoredKind | null,
): { error: ItemErrorKey } | { row: { kind?: string; attrs?: Json; expires_on?: string | null } } {
  const hasBook = !!(fields.book_author || fields.book_year || fields.book_isbn);
  if (input.medicine === undefined) {
    if (stored?.kind === "medicine") return { row: {} };
    const bookSent = fields.book_author !== undefined || fields.book_year !== undefined || fields.book_isbn !== undefined;
    return { row: bookSent ? { kind: hasBook ? "book" : "item" } : stored ? {} : { kind: "item" } };
  }
  if (input.medicine === null) return { row: { kind: hasBook ? "book" : "item", attrs: {}, expires_on: null } };
  const m = medicineInputSchema.safeParse(input.medicine);
  if (!m.success) return { error: firstIssue(m.error) };
  const { attrs, expires_on } = toMedicineRow(m.data, d.mode, stored?.masked ?? null, stored?.attrs ?? null);
  return { row: { kind: "medicine", attrs: attrs as unknown as Json, expires_on } };
}

/**
 * `current`: the stored text of the item being edited with its own-language text passed
 * through ownLocal (null for a new item); `foreign`: it is in another language than mine.
 */
function parseSave(input: SaveInput, d: DataLang, current: ItemTextRow | null, foreign = false, stored: StoredKind | null = null) {
  const fields = itemFieldsSchema(d.mode, foreign).safeParse(input.fields);
  if (!fields.success) return { error: firstIssue(fields.error) } as const;
  const refs = itemRefsSchema.safeParse({ category_id: input.category_id, location_id: input.location_id });
  if (!refs.success) return { error: "notFound" as const };
  const kind = kindColumns(input, fields.data, d, stored);
  if ("error" in kind) return { error: kind.error } as const;
  return { row: { ...toItemRow(fields.data, d, current), ...refs.data, ...kind.row } } as const;
}

/**
 * Creates an item. The client has already uploaded the photos to
 * {user_id}/{item_id}/{uuid}.jpg (+ .thumb.jpg) with an id it generated.
 * On any failure the uploaded files are removed.
 */
export async function createItem(
  input: SaveInput & { id: string; photos: string[]; primary: string | null; hashes?: Record<string, string> },
): Promise<ItemResult<{ id: string }>> {
  const supabase = await createClient();
  const user = await getUser();
  const photos = newPhotosSchema.safeParse(input.photos);
  const id = uuid.safeParse(input.id);
  const ownPhotos = user && id.success && photos.success ? photos.data.filter((p) => isOwnPhotoPath(p, user.id, id.data)) : [];

  // Anything that fails below must not leave uploaded files behind.
  const abort = async (error: ItemErrorKey) => {
    await removePhotoFiles(supabase, ownPhotos);
    return fail(error);
  };

  if (!user) return fail("unauthorized");
  if (!id.success) return abort("unknown");
  if (!photos.success) return abort(firstIssue(photos.error));
  if (ownPhotos.length !== photos.data.length) return abort("photoInvalid");
  // Plan limit: a clear message instead of a database error (the database enforces it too).
  if ((await getMyPlan())?.atItemLimit) return abort("planLimit");
  const mode = await getDataLang();
  const parsed = parseSave(input, mode, null);
  if ("error" in parsed) return abort(parsed.error ?? "unknown");

  const { error: itemError } = await supabase.from("items").insert({ id: id.data, ...parsed.row });
  if (itemError) return abort(dataErrorKey(itemError));

  if (ownPhotos.length > 0) {
    const primary = input.primary && ownPhotos.includes(input.primary) ? input.primary : ownPhotos[0];
    const { error: photoError } = await supabase
      .from("item_photos")
      .insert(
        ownPhotos.map((storage_path) => ({
          item_id: id.data,
          storage_path,
          is_primary: storage_path === primary,
          source_hash: hashFor(input.hashes, storage_path),
        })),
      );
    if (photoError) {
      await supabase.from("items").delete().eq("id", id.data);
      return abort("unknown");
    }
  }

  translateAfterSave(mode, [{ type: "item", id: id.data }]);
  refresh();
  return { ok: true, data: { id: id.data } };
}

type BatchItemInput = { id: string; fields: ItemFieldsInput; category_id: string | null; photo: string; medicine?: MedicineInput | null };

/** Runs `tasks` with at most `limit` at a time; resolves to their results in order. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Saves several items found on one photo ("several items in one photo"), all in one place.
 * The client has uploaded each item's cut-out to {user_id}/{item_id}/{uuid}.jpg and the whole
 * photo once, into the folder of the first item. The server copies the whole photo (main +
 * thumbnail) into every other item's folder, so each item owns its files and deleting an item
 * or a photo works as for any item. Primary photo = the cut-out, second = the whole photo.
 * Everything is inserted at once; on any failure the items and all files are removed.
 */
export async function createItemsBatch(input: {
  location_id: string | null;
  overview: string;
  /** SHA-256 of the original whole photo: stored on every copy of it (duplicate check). */
  overviewHash?: string | null;
  items: BatchItemInput[];
}): Promise<ItemResult<{ count: number; skipped: number }>> {
  const supabase = await createClient();
  const storage = supabase.storage.from(PHOTO_BUCKET);
  const user = await getUser();
  const items = Array.isArray(input.items) ? input.items.slice(0, MAX_BATCH_ITEMS + 1) : [];
  const ids = items.map((it) => uuid.safeParse(it?.id));
  const validIds = ids.every((r) => r.success) && new Set(items.map((it) => it.id)).size === items.length;

  // Files the client uploaded that really belong to this user and these items; only these are ever removed.
  const uploaded =
    user && validIds
      ? [
          ...items.map((it) => it.photo).filter((p, i) => typeof p === "string" && isOwnPhotoPath(p, user.id, items[i].id)),
          ...(typeof input.overview === "string" && items[0] && isOwnPhotoPath(input.overview, user.id, items[0].id)
            ? [input.overview]
            : []),
        ]
      : [];
  const copies: string[] = [];
  const abort = async (error: ItemErrorKey) => {
    await removePhotoFiles(supabase, [...uploaded, ...copies]);
    return fail(error);
  };

  if (!user) return fail("unauthorized");
  if (!validIds || items.length === 0) return abort("unknown");
  if (items.length > MAX_BATCH_ITEMS) return abort("unknown");
  // Every cut-out and the whole photo must be in their own item's folder, and all different.
  if (uploaded.length !== items.length + 1 || new Set(uploaded).size !== uploaded.length) return abort("photoInvalid");

  const mode = await getDataLang();
  const parsedRows = [];
  for (const it of items) {
    const parsed = parseSave(
      { fields: it.fields, category_id: it.category_id, location_id: input.location_id, medicine: it.medicine ?? null },
      mode,
      null,
    );
    if ("error" in parsed) return abort(parsed.error ?? "unknown");
    parsedRows.push({ id: it.id, ...parsed.row });
  }

  // Plan limit: save as many as fit, in the user's order; the rest lose their cut-outs and the
  // client says how many did not fit. (The database trigger enforces the limit as well.)
  const plan = await getMyPlan();
  const room =
    !plan || plan.isAdmin || plan.itemLimit === null ? items.length : Math.max(0, plan.itemLimit - plan.itemsCount);
  if (room === 0) return abort("planLimit");
  const saved = items.slice(0, room);
  const rows = parsedRows.slice(0, room);
  const skipped = items.length - saved.length;
  if (skipped > 0) await removePhotoFiles(supabase, items.slice(room).map((it) => it.photo));

  // Copy the whole photo into the other items' folders (server side, no second upload).
  const targets = saved.slice(1).map((it) => photoPath(user.id, it.id, crypto.randomUUID()));
  const copied = await pool(
    targets.map((to) => async () => {
      const [a, b] = await Promise.all([
        storage.copy(input.overview, to),
        storage.copy(thumbPath(input.overview), thumbPath(to)),
      ]);
      if (!a.error || !b.error) copies.push(to); // remove whatever part of the pair exists
      return !a.error && !b.error;
    }),
    4,
  );
  if (copied.includes(false)) return abort("photoUpload");

  const { error: itemError } = await supabase.from("items").insert(rows);
  if (itemError) return abort(dataErrorKey(itemError));

  const overviewOf = [input.overview, ...targets];
  const overviewHash = photoHashSchema.safeParse(input.overviewHash).success ? (input.overviewHash as string) : null;
  const { error: photoError } = await supabase.from("item_photos").insert(
    saved.flatMap((it, i) => [
      { item_id: it.id, storage_path: it.photo, is_primary: true },
      { item_id: it.id, storage_path: overviewOf[i], is_primary: false, source_hash: overviewHash },
    ]),
  );
  if (photoError) {
    await supabase.from("items").delete().in("id", saved.map((it) => it.id));
    return abort("unknown");
  }

  // Gemini filled English too; only items whose own-language text was edited lack it now.
  translateAfterSave(
    mode,
    rows
      .filter(
        (r) =>
          r.name_en === null ||
          (r.description_local && r.description_en === null) ||
          (r.attrs as { needs_en?: boolean } | undefined)?.needs_en === true,
      )
      .map((r) => ({ type: "item" as const, id: r.id })),
  );
  refresh();
  return { ok: true, data: { count: saved.length, skipped } };
}

/**
 * Saves items without photos ("add by voice"), each in its own place. Plan limit as in
 * createItemsBatch: as many as fit, in the user's order. Ids and refs are checked by RLS and the
 * composite keys; everything is inserted at once.
 */
export async function createItemsWithoutPhotos(input: {
  items: (SaveInput & { id: string })[];
}): Promise<ItemResult<{ count: number; skipped: number }>> {
  const user = await getUser();
  if (!user) return fail("unauthorized");
  const items = Array.isArray(input.items) ? input.items : [];
  const ids = items.map((it) => uuid.safeParse(it?.id));
  if (items.length === 0 || items.length > MAX_BATCH_ITEMS) return fail("unknown");
  if (!ids.every((r) => r.success) || new Set(items.map((it) => it.id)).size !== items.length) return fail("unknown");

  const mode = await getDataLang();
  const parsedRows = [];
  for (const it of items) {
    const parsed = parseSave(
      { fields: it.fields, category_id: it.category_id, location_id: it.location_id, medicine: it.medicine ?? null },
      mode,
      null,
    );
    if ("error" in parsed) return fail(parsed.error ?? "unknown");
    parsedRows.push({ id: it.id, ...parsed.row });
  }

  const plan = await getMyPlan();
  const room = !plan || plan.isAdmin || plan.itemLimit === null ? items.length : Math.max(0, plan.itemLimit - plan.itemsCount);
  if (room === 0) return fail("planLimit");
  const rows = parsedRows.slice(0, room);

  const supabase = await createClient();
  const { error } = await supabase.from("items").insert(rows);
  if (error) return fail(dataErrorKey(error));

  translateAfterSave(
    mode,
    rows.map((r) => ({ type: "item" as const, id: r.id })),
  );
  refresh();
  return { ok: true, data: { count: rows.length, skipped: items.length - rows.length } };
}

/**
 * Updates fields and photos. `keep` = existing main paths to keep, `add` = newly uploaded
 * main paths, `primary` = one path from keep ∪ add. Removed photos lose both files.
 */
export async function updateItem(
  input: SaveInput & { id: string; keep: string[]; add: string[]; primary: string | null; hashes?: Record<string, string> },
): Promise<ItemResult> {
  const supabase = await createClient();
  const user = await getUser();
  const id = uuid.safeParse(input.id);
  const add = newPhotosSchema.safeParse(input.add);
  const ownAdd = user && id.success && add.success ? add.data.filter((p) => isOwnPhotoPath(p, user.id, id.data)) : [];
  const abort = async (error: ItemErrorKey) => {
    await removePhotoFiles(supabase, ownAdd);
    return fail(error);
  };

  if (!user) return fail("unauthorized");
  if (!id.success) return abort("notFound");
  if (!add.success) return abort(firstIssue(add.error));
  if (ownAdd.length !== add.data.length) return abort("photoInvalid");
  const mode = await getDataLang();
  const { data: stored } = await supabase
    .from("items")
    .select("lang, name_local, name_en, description_local, description_en, tags_local, tags_en, kind, attrs")
    .eq("id", id.data)
    .maybeSingle();
  if (!stored) return abort("notFound");
  // A record in another language: its own text is not mine (kept unless I write my own).
  const current: ItemTextRow = {
    name_local: ownLocal(stored.lang, mode.lang, stored.name_local),
    name_en: stored.name_en,
    description_local: ownLocal(stored.lang, mode.lang, stored.description_local),
    description_en: stored.description_en,
    tags_local: ownLocal(stored.lang, mode.lang, stored.tags_local) ?? [],
    tags_en: stored.tags_en,
  };
  const foreign = isForeign(stored.lang, mode.lang);
  const storedAttrs = stored.kind === "medicine" ? readMedicineAttrs(stored.attrs) : null;
  const parsed = parseSave(input, mode, current, foreign, {
    kind: stored.kind,
    attrs: storedAttrs,
    masked: storedAttrs && maskMedicineAttrs(storedAttrs, foreign),
  });
  if ("error" in parsed) return abort(parsed.error ?? "unknown");

  const { data: existing, error: loadError } = await supabase
    .from("item_photos")
    .select("id, storage_path")
    .eq("item_id", id.data);
  if (loadError) return abort("unknown");

  const keep = existing.filter((p) => input.keep.includes(p.storage_path));
  const removed = existing.filter((p) => !input.keep.includes(p.storage_path));
  if (keep.length + ownAdd.length > MAX_PHOTOS) return abort("photoTooMany");

  const { error: itemError } = await supabase.from("items").update(parsed.row).eq("id", id.data).select("id").single();
  if (itemError) return abort(dataErrorKey(itemError));

  if (removed.length > 0) {
    const { error } = await supabase
      .from("item_photos")
      .delete()
      .in("id", removed.map((p) => p.id));
    if (error) return abort("unknown");
    await removePhotoFiles(supabase, removed.map((p) => p.storage_path));
  }

  if (ownAdd.length > 0) {
    const { error } = await supabase
      .from("item_photos")
      .insert(
        ownAdd.map((storage_path) => ({ item_id: id.data, storage_path, is_primary: false, source_hash: hashFor(input.hashes, storage_path) })),
      );
    if (error) return abort("unknown");
  }

  // Exactly one primary photo (a partial unique index allows at most one): clear, then set.
  const all = [...keep.map((p) => p.storage_path), ...ownAdd];
  if (all.length > 0) {
    const primary = input.primary && all.includes(input.primary) ? input.primary : all[0];
    await supabase.from("item_photos").update({ is_primary: false }).eq("item_id", id.data).eq("is_primary", true);
    await supabase.from("item_photos").update({ is_primary: true }).eq("item_id", id.data).eq("storage_path", primary);
  }

  translateAfterSave(mode, [{ type: "item", id: id.data }]);
  refresh();
  return { ok: true, data: undefined };
}

export async function moveItem(input: { id: string; location_id: string | null }): Promise<ItemResult> {
  const id = uuid.safeParse(input.id);
  const location = uuid.nullable().safeParse(input.location_id);
  if (!id.success) return fail("notFound");
  if (!location.success) return fail("parentNotFound");

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ location_id: location.data })
    .eq("id", id.data)
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  refresh();
  return { ok: true, data: undefined };
}

/** Deletes the item (photo rows cascade), then both files of every photo. */
export async function deleteItem(input: { id: string }): Promise<ItemResult> {
  const id = uuid.safeParse(input.id);
  if (!id.success) return fail("notFound");

  const supabase = await createClient();
  const { data: photos } = await supabase.from("item_photos").select("storage_path").eq("item_id", id.data);
  const { error } = await supabase.from("items").delete().eq("id", id.data).select("id").single();
  if (error) return fail(dataErrorKey(error, "delete"));

  await removePhotoFiles(supabase, (photos ?? []).map((p) => p.storage_path));
  refresh();
  return { ok: true, data: undefined };
}
