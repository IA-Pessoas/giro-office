import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const rhRequestUrgencySchema = z.enum(["Low", "Medium", "High"]);

export const rhRequestStatusSchema = z.enum(["New", "In_Progress", "Resolved", "Closed"]);

export const createRequestBodySchema = z
  .object({
    title: zNonEmptyText("title"),
    description: zNonEmptyText("description"),
    category_id: zNonEmptyText("category_id"),
    assigned_to_user_id: zNonEmptyText("assigned_to_user_id").optional(),
    urgency: rhRequestUrgencySchema,
  })
  .strict();

export const updateRequestBodySchema = z
  .object({
    id: zNonEmptyText("id"),
    title: zNonEmptyText("title").optional(),
    description: zNonEmptyText("description").optional(),
    category_id: zNonEmptyText("category_id").optional(),
    assigned_to_user_id: zNonEmptyText("assigned_to_user_id").optional(),
    urgency: rhRequestUrgencySchema.optional(),
    status: rhRequestStatusSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.title !== undefined ||
      body.description !== undefined ||
      body.category_id !== undefined ||
      body.assigned_to_user_id !== undefined ||
      body.urgency !== undefined ||
      body.status !== undefined,
    { message: "Informe ao menos um campo para atualizar." },
  );

export const deleteRequestBodySchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();

export const listRequestQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    status: rhRequestStatusSchema.optional(),
    category_id: z.string().uuid({ message: "category_id inválido." }).optional(),
    requester_user_id: z.string().uuid({ message: "requester_user_id inválido." }).optional(),
    assigned_to_user_id: z.string().uuid({ message: "assigned_to_user_id inválido." }).optional(),
  })
  .strict();

export const requestIdParamsSchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();
