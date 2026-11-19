import { z } from "zod";

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(200),
  from: z.enum(["ru", "en"]),
});

export type TranslateRequest = z.input<typeof translateRequestSchema>;
