import { z } from "zod";

import { idQuerySchema } from "./common.schemas.js";

export const createLicenseBodySchema = z
  .object({
    client_id: z.string().uuid().optional(),
    has: z.boolean(),
    type_license: z.string().min(1, "type_license obrigatorio."),
    entry_date: z.coerce.date(),
    protocol: z.string().min(1, "protocol obrigatorio."),
    responsible_id: z.string().uuid().optional(),
    status: z.string().min(1, "status obrigatorio."),
    date_last_consultation: z.coerce.date().optional(),
    current_situation: z.string().min(1, "current_situation obrigatorio."),
    contact: z.string().min(1, "contact obrigatorio."),
    observation: z.string().nullable().optional(),
    urgency: z.string().min(1, "urgency obrigatorio."),
    type: z.string().min(1, "type obrigatorio."),
    due_date: z.coerce.date().optional(),
    task_id: z.string().uuid().optional(),
  })
  .strict();

export const updateLicenseBodySchema = createLicenseBodySchema
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const licenseDetailQuerySchema = idQuerySchema;

export const listLicensesQuerySchema = z
  .object({
    status: z.string().min(1, "status obrigatorio."),
  })
  .strict();

export type CreateLicenseBody = z.infer<typeof createLicenseBodySchema>;
export type UpdateLicenseBody = z.infer<typeof updateLicenseBodySchema>;
