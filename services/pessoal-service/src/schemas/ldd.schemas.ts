import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const lddIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const listLddQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }).optional(),
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
    client_id: z.string().uuid({ message: "client_id invalido." }),
    type: zNonEmptyText("type"),
    period: z.string().trim().min(1, "period e obrigatorio.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateLddBodySchema = z
  .object({
    type: zNonEmptyText("type").optional(),
    period: z.string().trim().min(1, "period e obrigatorio.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreateLddBody = z.infer<typeof createLddBodySchema>;
export type UpdateLddBody = z.infer<typeof updateLddBodySchema>;
export type ListLddQuery = z.infer<typeof listLddQuerySchema>;
