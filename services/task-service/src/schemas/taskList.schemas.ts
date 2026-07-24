import { z } from "zod";

export const taskListQuerySchema = z
  .object({
    status: z.string().default("Todos"),
    ref: z.string().default(""),
    ref_id: z.string().default(""),
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
