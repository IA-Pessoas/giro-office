import { z } from "zod";

export const clientRegimeParamsSchema = z
  .object({ id: z.string().uuid({ message: "id do regime inválido." }) })
  .strict();
export const clientRegimeBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Informe o nome do regime." })
      .max(80, { message: "Nome do regime deve ter até 80 caracteres." }),
  })
  .strict();
