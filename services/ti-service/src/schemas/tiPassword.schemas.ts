import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiPasswordIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Senha de TI invalida." }),
  })
  .strict();

export const tiPasswordStatusFilterSchema = z.enum(["active", "inactive", "all"]);

export const listTiPasswordsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
      local: z.string().trim().optional(),
      search: z.string().trim().optional(),
      status: tiPasswordStatusFilterSchema.optional(),
    }),
  )
  .strict();

export const createTiPasswordBodySchema = z
  .object({
    local: zNonEmptyText("local"),
    user_id: z.string().uuid({ message: "Usuario invalido." }),
    password: zNonEmptyText("password"),
    notes: z.string().optional(),
  })
  .strict();

export const deactivateTiPasswordBodySchema = z
  .object({
    reason: z
      .string({ required_error: "Motivo da inativacao e obrigatorio." })
      .trim()
      .min(1, "Motivo da inativacao e obrigatorio.")
      .max(500, "Motivo da inativacao deve ter no maximo 500 caracteres."),
  })
  .strict();

export const updateTiPasswordBodySchema = createTiPasswordBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type TiPasswordStatusFilter = z.infer<typeof tiPasswordStatusFilterSchema>;
export type DeactivateTiPasswordBody = z.infer<typeof deactivateTiPasswordBodySchema>;
export type ListTiPasswordsQuery = z.infer<typeof listTiPasswordsQuerySchema>;
export type CreateTiPasswordBody = z.infer<typeof createTiPasswordBodySchema>;
export type UpdateTiPasswordBody = z.infer<typeof updateTiPasswordBodySchema>;
