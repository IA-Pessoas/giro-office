import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { LDD_PDF_MAX_BASE64_LENGTH } from "../services/lddPdfImportService.js";

export const lddIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listLddQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
  })
  .strict();

const optionalNonNegativeNumber = (fieldName: string) =>
  z
    .number()
    .nonnegative({ message: `${fieldName} não pode ser negativo.` })
    .nullable()
    .optional();

export const createLddBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    type: zNonEmptyText("type"),
    period: z.string().trim().min(1, "period é obrigatório.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateLddBodySchema = z
  .object({
    type: zNonEmptyText("type").optional(),
    period: z.string().trim().min(1, "period é obrigatório.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const previewLddImportBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    file_name: z.string().trim().min(1, "file_name é obrigatório.").max(255),
    content_base64: z
      .string()
      .min(1, "content_base64 é obrigatório.")
      .max(LDD_PDF_MAX_BASE64_LENGTH, "O PDF excede o limite de 700 KB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "content_base64 inválido."),
  })
  .strict();

export type PreviewLddImportBody = z.infer<typeof previewLddImportBodySchema>;
export type CreateLddBody = z.infer<typeof createLddBodySchema>;
export type UpdateLddBody = z.infer<typeof updateLddBodySchema>;
export type ListLddQuery = z.infer<typeof listLddQuerySchema>;
