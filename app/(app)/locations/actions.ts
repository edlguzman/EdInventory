"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataErrorKey, type DataErrorKey } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { locationNamesSchema, type NamePairInput } from "@/lib/validation/names";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: DataErrorKey };

const id = z.uuid();

function fail(error: DataErrorKey): { ok: false; error: DataErrorKey } {
  return { ok: false, error };
}

function zodError(error: z.ZodError): DataErrorKey {
  const key = error.issues[0]?.message;
  return key === "nameTooLong" || key === "nameRequired" ? key : "unknown";
}

/** Places feed the whole (app) layout (header, tree, picker), so refresh it all. */
function refresh() {
  revalidatePath("/", "layout");
}

export async function createLocation(
  input: NamePairInput & { parent_id: string | null },
): Promise<ActionResult<{ id: string }>> {
  const names = locationNamesSchema.safeParse(input);
  if (!names.success) return fail(zodError(names.error));
  const parent = id.nullable().safeParse(input.parent_id);
  if (!parent.success) return fail("parentNotFound");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("locations")
    .insert({ ...names.data, parent_id: parent.data })
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  refresh();
  return { ok: true, data: { id: data.id } };
}

export async function renameLocation(input: NamePairInput & { id: string }): Promise<ActionResult> {
  const names = locationNamesSchema.safeParse(input);
  if (!names.success) return fail(zodError(names.error));
  const target = id.safeParse(input.id);
  if (!target.success) return fail("notFound");

  const supabase = await createClient();
  const { error } = await supabase.from("locations").update(names.data).eq("id", target.data).select("id").single();
  if (error) return fail(dataErrorKey(error));

  refresh();
  return { ok: true, data: undefined };
}

export async function moveLocation(input: { id: string; parent_id: string | null }): Promise<ActionResult> {
  const target = id.safeParse(input.id);
  const parent = id.nullable().safeParse(input.parent_id);
  if (!target.success) return fail("notFound");
  if (!parent.success) return fail("parentNotFound");
  if (parent.data === target.data) return fail("locationCycle");

  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({ parent_id: parent.data })
    .eq("id", target.data)
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  refresh();
  return { ok: true, data: undefined };
}

/** Deletes only an empty place: the database refuses (on delete restrict) if it has nested places or items. */
export async function deleteLocation(input: { id: string }): Promise<ActionResult> {
  const target = id.safeParse(input.id);
  if (!target.success) return fail("notFound");

  const supabase = await createClient();
  const { error } = await supabase.from("locations").delete().eq("id", target.data).select("id").single();
  if (error) return fail(dataErrorKey(error, "delete"));

  refresh();
  return { ok: true, data: undefined };
}

/**
 * Creates a chain of nested places under `parent_id` (null = top level), outer to inner,
 * after the user confirmed the AI suggestion ("Create 'Top shelf' inside 'Dacha → Bedroom → Closet'?").
 * Returns the id of the innermost place. If a step fails, the places created so far are removed.
 */
export async function createLocationChain(input: {
  parent_id: string | null;
  names: NamePairInput[];
}): Promise<ActionResult<{ id: string }>> {
  const parent = id.nullable().safeParse(input.parent_id);
  if (!parent.success) return fail("parentNotFound");
  if (!Array.isArray(input.names) || input.names.length === 0 || input.names.length > 5) return fail("nameRequired");
  const parsed = input.names.map((n) => locationNamesSchema.safeParse(n));
  const bad = parsed.find((p) => !p.success);
  if (bad && !bad.success) return fail(zodError(bad.error));

  const supabase = await createClient();
  const created: string[] = [];
  let parentId = parent.data;
  for (const p of parsed) {
    if (!p.success) continue;
    const { data, error } = await supabase
      .from("locations")
      .insert({ ...p.data, parent_id: parentId })
      .select("id")
      .single();
    if (error) {
      // Undo inner-first so the restrict FK on parent_id is satisfied.
      for (const done of created.reverse()) await supabase.from("locations").delete().eq("id", done);
      return fail(dataErrorKey(error));
    }
    created.push(data.id);
    parentId = data.id;
  }

  refresh();
  return { ok: true, data: { id: parentId! } };
}
