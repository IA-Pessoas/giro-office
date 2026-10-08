import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

const tiExtensionNumberSchema = z.string().regex(/^[0-9]{3,4}$/, {
  message: "number deve conter 3 ou 4 dígitos.",
});

export const tiExtensionIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Ramal de TI inválido." }),
  })
  .strict();

export const listTiExtensionsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      user_id: z.string().uuid({ message: "Usuário inválido." }).optional(),
    }),
  )
  .strict();

export const createTiExtensionBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "Usuário inválido." }),
    number: tiExtensionNumberSchema,
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
