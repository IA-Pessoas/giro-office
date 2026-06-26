import { z } from "zod";

export const integracaoProjectProgressBodySchema = z
  .object({
    project_id: z.string().uuid({ message: "project_id inválido." }),
  })
  .strict();
