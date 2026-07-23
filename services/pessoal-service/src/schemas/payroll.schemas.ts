import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const payrollClientParamsSchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
  })
  .strict();

const optionalUuid = (fieldName: string) =>
  z
    .string()
    .uuid({ message: `${fieldName} invalido.` })
    .nullable()
    .optional();

export const createPayrollBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
    responsible_id: optionalUuid("responsible_id"),
    advance: z.boolean(),
    advance_type: z.string().trim().min(1).nullable().optional(),
    advance_amount: z.number().nullable().optional(),
    info: zNonEmptyText("info"),
    previous: z.boolean(),
    onvio: z.boolean(),
    group: zNonEmptyText("group"),
    vt: z.boolean(),
    vt_value: z.number().nullable().optional(),
    vt_type: z.string().trim().min(1).nullable().optional(),
    va: z.boolean(),
    assistance_fee: z.boolean(),
    union_id: optionalUuid("union_id"),
    bem_mais: z.boolean(),
    bsf: z.boolean(),
    reinf: z.boolean(),
    employees: z.number().int().nonnegative(),
    contact: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updatePayrollBodySchema = createPayrollBodySchema
  .omit({ client_id: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreatePayrollBody = z.infer<typeof createPayrollBodySchema>;
export type UpdatePayrollBody = z.infer<typeof updatePayrollBodySchema>;
