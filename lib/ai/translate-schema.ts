import { z } from "zod";

/** name: places, categories, item names (up to 200); description: item descriptions (up to 2000). */
export const translateRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(2000),
    /** Slot of the source text: "local" (the user's language) or "en"; the server knows the language. */
    from: z.enum(["local", "en"]),
    kind: z.enum(["name", "description"]).default("name"),
  })
  .refine((v) => v.kind === "description" || v.text.length <= 200);

export type TranslateRequest = z.input<typeof translateRequestSchema>;
