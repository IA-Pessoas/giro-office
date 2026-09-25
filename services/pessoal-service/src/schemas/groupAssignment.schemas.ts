import { z } from "zod";

const uuidSchema = (field: string) => z.string().uuid({ message: `${field} inválido.` });

const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
};

export const groupAssignmentEligibleQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(120).optional(),
    ...paginationFields,
  })
  .strict();

export const createGroupAssignmentPreviewBodySchema = z
  .object({
    group_id: uuidSchema("group_id"),
    client_ids: z.array(uuidSchema("client_ids")).min(1).max(500),
  })
  .strict()
  .refine((value) => new Set(value.client_ids).size === value.client_ids.length, {
    message: "client_ids não pode conter itens repetidos.",
  });

export const groupAssignmentPreviewParamsSchema = z
  .object({ preview_id: uuidSchema("preview_id") })
  .strict();

export const groupAssignmentPreviewQuerySchema = z.object(paginationFields).strict();

export const applyGroupAssignmentPreviewBodySchema = z
  .object({
    preview_id: uuidSchema("preview_id"),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/, { message: "fingerprint inválido." }),
  })
  .strict();

export const groupAssignmentIdempotencyKeySchema = z
  .string({ required_error: "Idempotency-Key é obrigatória." })
  .trim()
  .min(1, "Idempotency-Key é obrigatória.")
  .max(255, "Idempotency-Key deve ter no máximo 255 caracteres.");

export type GroupAssignmentEligibleQuery = z.infer<typeof groupAssignmentEligibleQuerySchema>;
export type CreateGroupAssignmentPreviewBody = z.infer<
  typeof createGroupAssignmentPreviewBodySchema
>;
export type GroupAssignmentPreviewQuery = z.infer<typeof groupAssignmentPreviewQuerySchema>;
export type ApplyGroupAssignmentPreviewBody = z.infer<typeof applyGroupAssignmentPreviewBodySchema>;
