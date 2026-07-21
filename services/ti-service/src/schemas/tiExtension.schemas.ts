import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiExtensionIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Ramal de TI invalido." }),
  })
  .strict();

export const listTiExtensionsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuario invalido." }).optional(),
    }),
  )
  .strict();

export const createTiExtensionBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "Usuario invalido." }),
    number: zNonEmptyText("number"),
  })
  .strict();

export const updateTiExtensionBodySchema = createTiExtensionBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type ListTiExtensionsQuery = z.infer<typeof listTiExtensionsQuerySchema>;
export type CreateTiExtensionBody = z.infer<typeof createTiExtensionBodySchema>;
export type UpdateTiExtensionBody = z.infer<typeof updateTiExtensionBodySchema>;
