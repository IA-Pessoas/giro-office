import { z } from "zod";

export const taskModelListQuerySchema = z
  .object({
    type: z.string().optional(),
    billing: z.string().optional(),
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
