"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataErrorKey, type DataErrorKey } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { getDataLang } from "@/lib/auth";
import { isForeign, ownLocal } from "@/lib/data-lang";
import { translateAfterSave } from "@/lib/translate/after-save";
import { categoryNamesSchema, toNameRow, type NamePairInput } from "@/lib/validation/names";
import type { ActionResult } from "../locations/actions";

const id = z.uuid();

function fail(error: DataErrorKey): { ok: false; error: DataErrorKey } {
  return { ok: false, error };
}

function zodError(error: z.ZodError): DataErrorKey {
  const key = error.issues[0]?.message;
  return key === "nameTooLong" || key === "nameRequired" ? key : "unknown";
}

export async function createCategory(input: NamePairInput): Promise<ActionResult<{ id: string }>> {
  const d = await getDataLang();
  const names = categoryNamesSchema(d.mode).safeParse(input);
  if (!names.success) return fail(zodError(names.error));

  const supabase = await createClient();
  // New categories go to the end of the list.
  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("categories")
    .insert({ ...toNameRow(d, names.data, null), sort_order: (last?.sort_order ?? 0) + 10 })
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  translateAfterSave(d, [{ type: "category", id: data.id }]);
  revalidatePath("/settings");
  return { ok: true, data: { id: data.id } };
}

export async function renameCategory(input: NamePairInput & { id: string }): Promise<ActionResult> {
  const d = await getDataLang();
  const target = id.safeParse(input.id);
  if (!target.success) return fail("notFound");

  const supabase = await createClient();
  const { data: row } = await supabase.from("categories").select("lang, name_local, name_en").eq("id", target.data).maybeSingle();
  if (!row) return fail("notFound");
  // A record in another language is edited through English (its own text is kept).
  const names = categoryNamesSchema(d.mode, isForeign(row.lang, d.lang)).safeParse(input);
  if (!names.success) return fail(zodError(names.error));
  const current = { name_local: ownLocal(row.lang, d.lang, row.name_local), name_en: row.name_en };
  const { error } = await supabase
    .from("categories")
    .update(toNameRow(d, names.data, current))
    .eq("id", target.data)
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  translateAfterSave(d, [{ type: "category", id: target.data }]);
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}

/** Items keep existing: their category_id becomes null (on delete set null). */
export async function deleteCategory(input: { id: string }): Promise<ActionResult> {
  const target = id.safeParse(input.id);
  if (!target.success) return fail("notFound");

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", target.data).select("id").single();
  if (error) return fail(dataErrorKey(error, "delete"));

  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
