import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiTermIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Termo de TI invalido." }),
  })
  .strict();

export const listTiTermsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
    }),
  )
  .strict();

export const createTiTermBodySchema = z
  .object({
    date: zIsoDate("date"),
    user_name: zNonEmptyText("user_name"),
    user_cpf: zNonEmptyText("user_cpf"),
    user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
    department_id: z.string().uuid({ message: "Departamento invalido." }).optional(),
    address: z.string().optional(),
    reason: z.string().optional(),
    equipament_list: z.string().optional(),
    brand: z.string().optional(),
    asset_code: z.string().optional(),
    imei: z.string().optional(),
  })
  .strict();

export const updateTiTermBodySchema = createTiTermBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const signTiTermBodySchema = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export type CreateTiTermBody = z.infer<typeof createTiTermBodySchema>;
export type UpdateTiTermBody = z.infer<typeof updateTiTermBodySchema>;
export type SignTiTermBody = z.infer<typeof signTiTermBodySchema>;
export type ListTiTermsQuery = z.infer<typeof listTiTermsQuerySchema>;
