import { z } from "zod";

export const noahUploadQuerySchema = z
  .object({
    filename: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[^/\\:]+\.zip$/iu, "Envie um arquivo ZIP com nome válido.")
      .refine((value) => !/\p{Cc}/u.test(value), "Nome de arquivo inválido."),
  })
  .strict();

export const noahIdParamsSchema = z
  .object({
    id: z.string().uuid("Conversão inválida."),
  })
  .strict();
