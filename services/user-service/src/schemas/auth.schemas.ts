import { z } from "zod";

export const loginBodySchema = z
  .object({
    login: z.string().trim().min(1, "login é obrigatório."),
    password: z.string().min(1, "password é obrigatório."),
  })
  .strict();
