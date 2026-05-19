import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const tiPasswordIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Senha de TI invalida." }),
  })
  .strict();

export const listTiPasswordsQuerySchema = z
  .object({
    user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
  })
  .strict();

export const createTiPasswordBodySchema = z
  .object({
    local: zNonEmptyText("local"),
    user_id: z.string().uuid({ message: "Usuario invalido." }),
    password: zNonEmptyText("password"),
    notes: z.string().optional(),
  })
  .strict();

export const updateTiPasswordBodySchema = createTiPasswordBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type ListTiPasswordsQuery = z.infer<typeof listTiPasswordsQuerySchema>;
export type CreateTiPasswordBody = z.infer<typeof createTiPasswordBodySchema>;
export type UpdateTiPasswordBody = z.infer<typeof updateTiPasswordBodySchema>;
