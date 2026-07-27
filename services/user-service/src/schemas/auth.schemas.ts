import { z } from "zod";

export const loginBodySchema = z
  .object({
    login: z.string().trim().min(1, "login e obrigatorio."),
    password: z.string().min(1, "password e obrigatorio."),
  })
  .strict();
