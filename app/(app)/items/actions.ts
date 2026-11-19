"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { dataErrorKey, type DataErrorKey } from "@/lib/db-errors";
import { isOwnPhotoPath, MAX_PHOTOS, PHOTO_BUCKET, photoFiles } from "@/lib/photos/paths";
import { createClient } from "@/lib/supabase/server";
import { itemFieldsSchema, itemRefsSchema, newPhotosSchema, toItemRow, type ItemFieldsInput } from "@/lib/validation/items";

export type ItemErrorKey =
  | DataErrorKey
  | "descriptionTooLong"
  | "tagTooLong"
  | "tooManyTags"
  | "photoTooMany"
  | "photoInvalid"
  | "unauthorized";

export type ItemResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ItemErrorKey };

type Supabase = Awaited<ReturnType<typeof createClient>>;

const uuid = z.uuid();
const fail = (error: ItemErrorKey): { ok: false; error: ItemErrorKey } => ({ ok: false, error });

function firstIssue(error: z.ZodError): ItemErrorKey {
  const key = error.issues[0]?.message;
  const known: ItemErrorKey[] = ["nameRequired", "nameTooLong", "descriptionTooLong", "tagTooLong", "tooManyTags", "photoTooMany"];
  return known.includes(key as ItemErrorKey) ? (key as ItemErrorKey) : "unknown";
}

/** Removes main + thumbnail files. Best effort: a leftover file is invisible, a broken item is not. */
async function removePhotoFiles(supabase: Supabase, mainPaths: string[]) {
  if (mainPaths.length === 0) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(mainPaths.flatMap(photoFiles));
  if (error) console.error("photo files not removed", { count: mainPaths.length, message: error.message });
}

/** Item counts change the tree, the header and the lists: refresh the whole (app) layout. */
function refresh() {
  revalidatePath("/", "layout");
}

type SaveInput = {
  fields: ItemFieldsInput;
  category_id: string | null;
  location_id: string | null;
};

function parseSave(input: SaveInput) {
  const fields = itemFieldsSchema.safeParse(input.fields);
  if (!fields.success) return { error: firstIssue(fields.error) } as const;
  const refs = itemRefsSchema.safeParse({ category_id: input.category_id, location_id: input.location_id });
  if (!refs.success) return { error: "notFound" as const };
  return { row: { ...toItemRow(fields.data), ...refs.data } } as const;
}

/**
 * Creates an item. The client has already uploaded the photos to
 * {user_id}/{item_id}/{uuid}.jpg (+ .thumb.jpg) with an id it generated.
 * On any failure the uploaded files are removed.
 */
export async function createItem(
  input: SaveInput & { id: string; photos: string[]; primary: string | null },
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
  const parsed = parseSave(input);
  if ("error" in parsed) return abort(parsed.error ?? "unknown");

  const { error: itemError } = await supabase.from("items").insert({ id: id.data, ...parsed.row });
  if (itemError) return abort(dataErrorKey(itemError));

  if (ownPhotos.length > 0) {
    const primary = input.primary && ownPhotos.includes(input.primary) ? input.primary : ownPhotos[0];
    const { error: photoError } = await supabase
      .from("item_photos")
      .insert(ownPhotos.map((storage_path) => ({ item_id: id.data, storage_path, is_primary: storage_path === primary })));
    if (photoError) {
      await supabase.from("items").delete().eq("id", id.data);
      return abort("unknown");
    }
  }

  refresh();
  return { ok: true, data: { id: id.data } };
}

/**
 * Updates fields and photos. `keep` = existing main paths to keep, `add` = newly uploaded
 * main paths, `primary` = one path from keep ∪ add. Removed photos lose both files.
 */
export async function updateItem(
  input: SaveInput & { id: string; keep: string[]; add: string[]; primary: string | null },
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
  const parsed = parseSave(input);
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
      .insert(ownAdd.map((storage_path) => ({ item_id: id.data, storage_path, is_primary: false })));
    if (error) return abort("unknown");
  }

  // Exactly one primary photo (a partial unique index allows at most one): clear, then set.
  const all = [...keep.map((p) => p.storage_path), ...ownAdd];
  if (all.length > 0) {
    const primary = input.primary && all.includes(input.primary) ? input.primary : all[0];
    await supabase.from("item_photos").update({ is_primary: false }).eq("item_id", id.data).eq("is_primary", true);
    await supabase.from("item_photos").update({ is_primary: true }).eq("item_id", id.data).eq("storage_path", primary);
  }

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
