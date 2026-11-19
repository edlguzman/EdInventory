"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dataErrorKey, type DataErrorKey } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { getDataLang } from "@/lib/auth";
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
  const mode = await getDataLang();
  const names = categoryNamesSchema(mode).safeParse(input);
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
    .insert({ ...toNameRow(mode, names.data, null), sort_order: (last?.sort_order ?? 0) + 10 })
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  translateAfterSave(mode, [{ type: "category", id: data.id }]);
  revalidatePath("/settings");
  return { ok: true, data: { id: data.id } };
}

export async function renameCategory(input: NamePairInput & { id: string }): Promise<ActionResult> {
  const mode = await getDataLang();
  const names = categoryNamesSchema(mode).safeParse(input);
  if (!names.success) return fail(zodError(names.error));
  const target = id.safeParse(input.id);
  if (!target.success) return fail("notFound");

  const supabase = await createClient();
  const { data: current } = await supabase.from("categories").select("name_ru, name_en").eq("id", target.data).maybeSingle();
  if (!current) return fail("notFound");
  const { error } = await supabase
    .from("categories")
    .update(toNameRow(mode, names.data, current))
    .eq("id", target.data)
    .select("id")
    .single();
  if (error) return fail(dataErrorKey(error));

  translateAfterSave(mode, [{ type: "category", id: target.data }]);
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
