import { z } from "zod";

import { idQuerySchema } from "./common.schema.js";

export const createProcessBodySchema = z
  .object({
    client_pj_id: z.string().uuid().optional(),
    client_pf_id: z.string().uuid().optional(),
    cpf_cnpj: z.string().min(1, "cpf_cnpj obrigatorio."),
    process_type: z.string().min(1, "process_type obrigatorio."),
    description: z.string().min(1, "description obrigatorio."),
    entry_date: z.coerce.date().optional(),
    completion_date: z.coerce.date().optional(),
    expected_date: z.coerce.date().optional(),
    status: z.string().min(1, "status obrigatorio."),
    observation: z.string().nullable().optional(),
    responsible1_id: z.string().uuid().optional(),
    responsible2_id: z.string().uuid().optional(),
    responsible3_id: z.string().uuid().optional(),
    locking_type: z.string().nullable().optional(),
    urgency: z.string().nullable().optional(),
    task_id: z.string().uuid().optional(),
  })
  .strict();

export const updateProcessBodySchema = createProcessBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const processDetailQuerySchema = idQuerySchema;

export const listProcessesQuerySchema = z
  .object({
    status: z.string().min(1, "status obrigatorio."),
  })
  .strict();

export type CreateProcessBody = z.infer<typeof createProcessBodySchema>;
export type UpdateProcessBody = z.infer<typeof updateProcessBodySchema>;
