import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiInventoryIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Ativo de TI inválido." }),
  })
  .strict();

export const createTiInventoryBodySchema = z
  .object({
    asset_code: zNonEmptyText("asset_code"),
    category_id: z.string().uuid({ message: "Categoria de inventário inválida." }),
    location_id: z.string().uuid({ message: "Local de inventário inválido." }).optional(),
    user_id: z.string().uuid({ message: "Usuário inválido." }).optional(),
    responsible_it_staff_id: z.string().uuid({ message: "Responsável de TI inválido." }).optional(),
    notes: z.string().optional(),
    delivery_date: zIsoDate("delivery_date").optional(),
  })
  .strict();

export const updateTiInventoryBodySchema = createTiInventoryBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const assignTiInventoryUserBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "Usuário inválido." }),
    delivery_date: zIsoDate("delivery_date").optional(),
  })
  .strict();

export const returnTiInventoryBodySchema = z
  .object({
    return_date: zIsoDate("return_date").optional(),
    notes: z.string().optional(),
  })
  .strict();

export const listTiInventoryQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      category_id: z.string().uuid({ message: "Categoria de inventário inválida." }).optional(),
      location_id: z.string().uuid({ message: "Local de inventário inválido." }).optional(),
      user_id: z.string().uuid({ message: "Usuário inválido." }).optional(),
      asset_code: z.string().optional(),
      status: z.enum(["available", "assigned"]).optional(),
    }),
  )
  .strict();

export type CreateTiInventoryBody = z.infer<typeof createTiInventoryBodySchema>;
export type UpdateTiInventoryBody = z.infer<typeof updateTiInventoryBodySchema>;
export type AssignTiInventoryUserBody = z.infer<typeof assignTiInventoryUserBodySchema>;
export type ReturnTiInventoryBody = z.infer<typeof returnTiInventoryBodySchema>;
export type ListTiInventoryQuery = z.infer<typeof listTiInventoryQuerySchema>;
