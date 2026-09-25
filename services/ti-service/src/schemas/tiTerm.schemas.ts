import { zIsoDate } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiTermIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Termo de TI inválido." }),
  })
  .strict();

export const listTiTermsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuário inválido." }).optional(),
      status: z.enum(["pending", "signed"]).optional(),
    }),
  )
  .strict();

export const createTiTermBodySchema = z
  .object({
    date: zIsoDate("date"),
    user_id: z.string().uuid({ message: "Usuário inválido." }),
    department_id: z.string().uuid({ message: "Departamento inválido." }).optional(),
    address: z.string().optional(),
    reason: z.string().optional(),
    equipament_list: z.string().optional(),
    brand: z.string().optional(),
    asset_code: z.string().optional(),
    imei: z.string().optional(),
  })
  .strict();

const tiTermEditableFieldsSchema = z
  .object({
    date: zIsoDate("date").optional(),
    department_id: z.string().uuid({ message: "Departamento inválido." }).optional(),
    address: z.string().optional(),
    reason: z.string().optional(),
    equipament_list: z.string().optional(),
    brand: z.string().optional(),
    asset_code: z.string().optional(),
    imei: z.string().optional(),
  })
  .strict();

export const updateTiTermBodySchema = tiTermEditableFieldsSchema.refine(
  (value) => Object.keys(value).length > 0,
  {
    message: "Informe ao menos um campo para atualizar.",
  },
);

export const signTiTermBodySchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export type CreateTiTermBody = z.infer<typeof createTiTermBodySchema>;
export type UpdateTiTermBody = z.infer<typeof updateTiTermBodySchema>;
export type SignTiTermBody = z.infer<typeof signTiTermBodySchema>;
export type ListTiTermsQuery = z.infer<typeof listTiTermsQuerySchema>;
