import { z } from "zod";

export const platformLoginBodySchema = z
  .object({
    email: z.string().email({ message: "email invalido." }),
    password: z.string().min(1, { message: "password e obrigatorio." }),
  })
  .strict();

export const startSupportSessionBodySchema = z
  .object({
    organization_id: z.string().uuid({ message: "organization_id invalido." }),
    reason: z
      .string()
      .trim()
      .min(8, { message: "reason deve ter ao menos 8 caracteres." })
      .max(500, {
        message: "reason deve ter no maximo 500 caracteres.",
      }),
  })
  .strict();

export type PlatformLoginBody = z.infer<typeof platformLoginBodySchema>;
export type StartSupportSessionBody = z.infer<typeof startSupportSessionBodySchema>;
