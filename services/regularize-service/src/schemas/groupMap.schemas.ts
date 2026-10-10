import { z } from "zod";

export const groupMapParamsSchema = z
  .object({
    id: z.string().uuid("Grupo inválido."),
  })
  .strict();
