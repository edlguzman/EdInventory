import "server-only";
import { z } from "zod";
import { ownId, type aiLocations } from "@/lib/ai/context";
import type { PlaceAnswer } from "@/lib/ai/types";
import type { Lang } from "@/lib/languages";

/** Model fields of one mentioned place ("" / [] = none). No limits: also used inside lists (see recognize-multi). */
export const placeModelFields = {
  match_id: z.string(),
  create_parent_id: z.string(),
  create_names: z.array(z.object({ name_local: z.string(), name_en: z.string() })),
  ambiguous_ids: z.array(z.string()),
};

type ModelPlace = { match_id: string; create_parent_id: string; create_names: { name_local: string; name_en: string }[]; ambiguous_ids: string[] };
type Places = Awaited<ReturnType<typeof aiLocations>>;

/** How to find a place, shared by "put it ..." (place) and "add by voice" (voice-add). */
export const PLACE_RULES = `- If it already exists: match_id = its id.
- If only part of the path exists: create_parent_id = id of the deepest existing place on that path ("" for the top level),
  create_names = the missing places from outer to inner, each a short label (name_local and name_en, see LANGUAGE).
- If several existing places fit equally and the phrase does not tell them apart (e.g. "bedroom" exists in two houses):
  ambiguous_ids = their ids, and match_id = "", create_names = [].
- Relative phrases ("here", "on the top shelf" without a parent) are relative to the current place, if one is given.`;

/** Server-side checks: only the user's ids; exactly one kind of answer (or none). */
export function cleanPlace(r: ModelPlace, places: Places, lang: Lang): PlaceAnswer {
  let match = ownId(r.match_id, places.ids);
  const ambiguous = match ? [] : [...new Set(r.ambiguous_ids.map((id) => ownId(id, places.ids)).filter((id): id is string => !!id))];
  // English users: English names only; otherwise both (a missing one is copied from the other).
  const cut = (s: string) => s.trim().slice(0, 200).trim();
  const names = r.create_names
    .slice(0, 5)
    .map((n) =>
      lang === "en"
        ? { name_local: "", name_en: cut(n.name_en) || cut(n.name_local) }
        : { name_local: cut(n.name_local) || cut(n.name_en), name_en: cut(n.name_en) || cut(n.name_local) },
    )
    .filter((n) => n.name_en);
  const create = !match && ambiguous.length < 2 && names.length > 0 ? { parent_id: ownId(r.create_parent_id, places.ids), names } : null;
  // A single "ambiguous" candidate is simply the match.
  if (!match && ambiguous.length === 1 && !create) match = ambiguous[0];
  return { match, create, ambiguous: ambiguous.length >= 2 ? ambiguous : [] };
}
