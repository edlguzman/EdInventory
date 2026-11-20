/** Error keys (namespace "errors" in messages/*.json) for data mutations. */
export type DataErrorKey =
  | "nameRequired"
  | "nameTooLong"
  | "locationCycle"
  | "locationNotEmpty"
  | "parentNotFound"
  | "notFound"
  | "planLimit"
  | "unknown";

type PgError = { code?: string; message?: string; hint?: string | null; details?: string | null } | null;

/** Maps Postgres / PostgREST errors to dictionary keys, so raw messages never reach the user. */
export function dataErrorKey(error: PgError, context: "save" | "delete" = "save"): DataErrorKey {
  switch (error?.code) {
    case "23514": // check_violation
      if (error.hint === "location_cycle" || error.message?.includes("locations_not_own_parent")) return "locationCycle";
      if (error.message?.includes("name_")) return "nameRequired";
      return "unknown";
    case "23503": // foreign_key_violation
      return context === "delete" ? "locationNotEmpty" : "parentNotFound";
    case "PGRST116": // .single() found no row (missing or not the user's)
      return "notFound";
    case "P0010": // items_enforce_plan_limit: the plan's item limit is reached
      return "planLimit";
  }
  return "unknown";
}
