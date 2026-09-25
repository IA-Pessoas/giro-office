import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiPasswordIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Senha de TI inválida." }),
  })
  .strict();

export const tiPasswordStatusFilterSchema = z.enum(["active", "inactive", "all"]);

export const listTiPasswordsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuário inválido." }).optional(),
      local: z.string().trim().optional(),
      search: z.string().trim().optional(),
      status: tiPasswordStatusFilterSchema.optional(),
    }),
  )
  .strict();

export const createTiPasswordBodySchema = z
  .object({
    local: zNonEmptyText("local"),
    user_id: z.string().uuid({ message: "Usuário inválido." }),
    password: zNonEmptyText("password"),
    notes: z.string().optional(),
  })
  .strict();

export const deactivateTiPasswordBodySchema = z
  .object({
    reason: z
      .string({ required_error: "Motivo da inativação é obrigatório." })
      .trim()
      .min(1, "Motivo da inativação é obrigatório.")
      .max(500, "Motivo da inativação deve ter no máximo 500 caracteres."),
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
