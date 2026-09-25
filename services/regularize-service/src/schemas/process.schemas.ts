import { z } from "zod";

import { idQuerySchema } from "./common.schemas.js";
import {
  processFinancialStatusSchema,
  processReadStatusSchema,
  processWriteStatusSchema,
} from "./status.schemas.js";

const processDateSchema = z
  .union([z.string().date(), z.string().datetime({ offset: true })])
  .transform((value) => new Date(value));

const processFieldsSchema = z
  .object({
    client_pj_id: z.string().uuid().optional(),
    client_pf_id: z.string().uuid().optional(),
    cpf_cnpj: z.string().min(1, "cpf_cnpj obrigatório."),
    process_type: z.string().min(1, "process_type obrigatório."),
    description: z.string().min(1, "description obrigatório."),
    entry_date: z.coerce.date().optional(),
    completion_date: z.coerce.date().optional(),
    expected_date: z.coerce.date().optional(),
    client_notice_date: processDateSchema.nullable().optional(),
    status: processWriteStatusSchema,
    financial_status: processFinancialStatusSchema.optional(),
    observation: z.string().nullable().optional(),
    responsible1_id: z.string().uuid().optional(),
    responsible2_id: z.string().uuid().optional(),
    responsible3_id: z.string().uuid().optional(),
    locking_type: z.string().nullable().optional(),
    urgency: z.string().nullable().optional(),
    task_id: z.string().uuid().optional(),
  })
  .strict();

function requireExactlyOneClient(
  value: {
    client_pj_id?: string;
    client_pf_id?: string;
  },
  context: z.RefinementCtx,
): void {
  if (Boolean(value.client_pj_id) === Boolean(value.client_pf_id)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["client_pj_id"],
      message: "Informe exatamente um cliente PJ ou PF.",
    });
  }
}

export const createProcessBodySchema = processFieldsSchema
  .extend({ financial_status: processFinancialStatusSchema.default("Pendente") })
  .superRefine(requireExactlyOneClient);

export const updateProcessBodySchema = processFieldsSchema
  .extend({ id: z.string().uuid("id inválido.") })
  .superRefine(requireExactlyOneClient);

export const processActionBodySchema = z.object({ id: z.string().uuid("id inválido.") }).strict();

export const processDetailQuerySchema = idQuerySchema;

export const listProcessesQuerySchema = z
  .object({
    status: processReadStatusSchema,
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export type CreateProcessBody = z.infer<typeof createProcessBodySchema>;
export type UpdateProcessBody = z.infer<typeof updateProcessBodySchema>;
