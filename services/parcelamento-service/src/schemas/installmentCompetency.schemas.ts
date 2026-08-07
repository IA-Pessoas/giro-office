import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

const nonEmptyText = (field: string) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} e obrigatorio.` });

const optionalText = z.string().trim().optional().nullable();
const nonNegativeInteger = z.coerce.number().int().min(0);
const nonNegativeNumber = z.coerce.number().min(0);

export const installmentCompetencyParentParamsSchema = z
  .object({
    installmentId: z.string().uuid({ message: "installmentId invalido." }),
  })
  .strict();

export const installmentCompetencyIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const listInstallmentCompetenciesQuerySchema = paginationQuerySchema;

export const createInstallmentCompetencyBodySchema = z
  .object({
    competence: nonEmptyText("competence"),
    how_many_paid: nonNegativeInteger,
    how_many_overdue: nonNegativeInteger,
    download: z.boolean(),
    download_notes: optionalText,
    upload_file: z.boolean().optional().nullable(),
    is_sent: z.boolean().optional().nullable(),
    submission_type: optionalText,
    notes: optionalText,
    installment_amount: nonNegativeNumber,
  })
  .strict();

export const patchInstallmentCompetencyBodySchema = z
  .object({
    how_many_paid: nonNegativeInteger.optional(),
    how_many_overdue: nonNegativeInteger.optional(),
    download: z.boolean().optional(),
    download_notes: optionalText,
    upload_file: z.boolean().optional().nullable(),
    is_sent: z.boolean().optional().nullable(),
    submission_type: optionalText,
    notes: optionalText,
    installment_amount: nonNegativeNumber.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type InstallmentCompetencyParentParams = z.infer<
  typeof installmentCompetencyParentParamsSchema
>;
export type InstallmentCompetencyIdParams = z.infer<typeof installmentCompetencyIdParamsSchema>;
export type ListInstallmentCompetenciesQuery = z.infer<
  typeof listInstallmentCompetenciesQuerySchema
>;
export type CreateInstallmentCompetencyBody = z.infer<typeof createInstallmentCompetencyBodySchema>;
export type PatchInstallmentCompetencyBody = z.infer<typeof patchInstallmentCompetencyBodySchema>;
