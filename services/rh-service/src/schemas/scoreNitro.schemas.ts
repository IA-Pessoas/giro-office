import { z } from "zod";

export const updateScoreNitroBodySchema = z
  .object({
    score_id: z.string().uuid({ message: "score_id inválido." }),
    type: z.enum(["projects", "hours", "errors", "folders"]),
    value: z.coerce.number(),
  })
  .strict();

export type UpdateScoreNitroBody = z.infer<typeof updateScoreNitroBodySchema>;
