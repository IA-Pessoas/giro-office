import { z } from "zod";

export const platformLoginBodySchema = z
  .object({
    email: z.string().trim().email("email inválido."),
    password: z.string().min(1, "password é obrigatório."),
  })
  .strict();
