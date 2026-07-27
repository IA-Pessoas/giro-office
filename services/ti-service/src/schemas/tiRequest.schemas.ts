import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

export const tiRequestUrgencySchema = z.enum(["Low", "Medium", "High", "Critical"]);
export const tiRequestStatusSchema = z.enum([
  "New",
  "In_Progress",
  "Waiting",
  "Resolved",
  "Closed",
]);

export const tiRequestIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Chamado de TI invalido." }),
  })
  .strict();

export const createTiRequestBodySchema = z
  .object({
    title: zNonEmptyText("title"),
    description: zNonEmptyText("description"),
    category_id: z.string().uuid({ message: "Categoria de TI invalida." }),
    requester_id: z.string().uuid({ message: "Solicitante invalido." }).optional(),
    assigned_to_id: z.string().uuid({ message: "Responsavel invalido." }).optional(),
    urgency: tiRequestUrgencySchema.default("Medium"),
    attachment: z.string().url({ message: "Anexo deve ser uma URL valida." }).optional(),
  })
  .strict();

export const updateTiRequestBodySchema = z
  .object({
    title: zNonEmptyText("title").optional(),
    description: zNonEmptyText("description").optional(),
    category_id: z.string().uuid({ message: "Categoria de TI invalida." }).optional(),
    urgency: tiRequestUrgencySchema.optional(),
    attachment: z.string().url({ message: "Anexo deve ser uma URL valida." }).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const assignTiRequestBodySchema = z
  .object({
    assigned_to_id: z.string().uuid({ message: "Responsavel invalido." }),
  })
  .strict();

export const updateTiRequestStatusBodySchema = z
  .object({
    status: tiRequestStatusSchema,
  })
  .strict();

export const createTiMessageBodySchema = z
  .object({
    message: zNonEmptyText("message"),
    type: z.enum(["Message", "Solution", "Rejection", "Acceptance"]).default("Message"),
  })
  .strict();

export const listTiRequestsQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      status: tiRequestStatusSchema.optional(),
      urgency: tiRequestUrgencySchema.optional(),
      category_id: z.string().uuid({ message: "Categoria de TI invalida." }).optional(),
      requester_id: z.string().uuid({ message: "Solicitante invalido." }).optional(),
      assigned_to_id: z.string().uuid({ message: "Responsavel invalido." }).optional(),
      created_from: zIsoDate("created_from").optional(),
      created_to: zIsoDate("created_to").optional(),
    }),
  )
  .strict();

export const listTiMessagesQuerySchema = paginationQuerySchema
  .merge(
    z.object({
      created_from: zIsoDate("created_from").optional(),
      created_to: zIsoDate("created_to").optional(),
    }),
  )
  .strict();

export type CreateTiRequestBody = z.infer<typeof createTiRequestBodySchema>;
export type UpdateTiRequestBody = z.infer<typeof updateTiRequestBodySchema>;
export type AssignTiRequestBody = z.infer<typeof assignTiRequestBodySchema>;
export type UpdateTiRequestStatusBody = z.infer<typeof updateTiRequestStatusBodySchema>;
export type CreateTiMessageBody = z.infer<typeof createTiMessageBodySchema>;
export type ListTiRequestsQuery = z.infer<typeof listTiRequestsQuerySchema>;
export type ListTiMessagesQuery = z.infer<typeof listTiMessagesQuerySchema>;
