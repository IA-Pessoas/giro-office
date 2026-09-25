import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

const nonEmptyText = (field: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} é obrigatório.` });

const optionalText = z.string().trim().optional().nullable();
const optionalDate = z.coerce.date().optional().nullable();
const nonNegativeNumber = z.coerce.number().min(0);
const positiveInteger = z.coerce.number().int().min(1);

export const installmentIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listInstallmentsQuerySchema = paginationQuerySchema
  .extend({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
    status: nonEmptyText("status").optional(),
    type: nonEmptyText("type").optional(),
    jurisdiction: nonEmptyText("jurisdiction").optional(),
    search: nonEmptyText("search").optional(),
  })
  .strict();

export const createInstallmentBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    agreement_number: optionalText,
    type: nonEmptyText("type"),
    legal_nature: nonEmptyText("legal_nature"),
    jurisdiction: nonEmptyText("jurisdiction"),
    is_automatic_debit: z.boolean(),
    consolidated_total_amount: nonNegativeNumber.optional(),
    first_installment_amount: nonNegativeNumber,
    current_month_installment_amount: nonNegativeNumber,
    agreed_installments_count: positiveInteger,
    enrollment_date: optionalDate,
  })
  .strict();

export const patchInstallmentBodySchema = z
  .object({
    agreement_number: optionalText,
    type: nonEmptyText("type").optional(),
    legal_nature: nonEmptyText("legal_nature").optional(),
    jurisdiction: nonEmptyText("jurisdiction").optional(),
    is_automatic_debit: z.boolean().optional(),
    consolidated_total_amount: nonNegativeNumber.optional(),
    first_installment_amount: nonNegativeNumber.optional(),
    current_month_installment_amount: nonNegativeNumber.optional(),
    agreed_installments_count: positiveInteger.optional(),
    enrollment_date: optionalDate,
    document_url: z.string().optional(),
    situation_shutdown: optionalText,
    status: nonEmptyText("status").optional(),
    completion_date: optionalDate,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type InstallmentIdParams = z.infer<typeof installmentIdParamsSchema>;
export type ListInstallmentsQuery = z.infer<typeof listInstallmentsQuerySchema>;
export type CreateInstallmentBody = z.infer<typeof createInstallmentBodySchema>;
export type PatchInstallmentBody = z.infer<typeof patchInstallmentBodySchema>;
