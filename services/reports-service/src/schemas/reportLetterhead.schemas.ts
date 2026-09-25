import { z } from "zod";

export const reportLetterheadReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  })
  .strict();

export type ReportLetterheadReference = z.infer<typeof reportLetterheadReferenceSchema>;
