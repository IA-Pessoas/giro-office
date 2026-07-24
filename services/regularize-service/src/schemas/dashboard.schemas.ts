import { z } from "zod";

export const regularizeDashboardQuerySchema = z
  .object({
    year: z.coerce.number().int(),
  })
  .strict();
