import { z } from "zod";

/** SHA-256 of the original photo file, lower-case hex (item_photos.source_hash). */
export const photoHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
