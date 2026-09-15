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

const optionalGroupId = z.string().uuid({ message: "group_id invalido." }).optional();

const optionalNonNegativeNumber = (fieldName: string) =>
  z
    .number()
    .nonnegative({ message: `${fieldName} não pode ser negativo.` })
    .nullable()
    .optional();

const payrollBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id invalido." }),
    responsible_id: optionalUuid("responsible_id"),
    advance: z.boolean(),
    advance_type: z.string().trim().min(1).nullable().optional(),
    advance_amount: optionalNonNegativeNumber("advance_amount"),
    info: zNonEmptyText("info"),
    previous: z.boolean(),
    onvio: z.boolean(),
    group_id: optionalGroupId,
    group: zNonEmptyText("group").optional(),
    vt: z.boolean(),
    vt_value: optionalNonNegativeNumber("vt_value"),
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

export const createPayrollBodySchema = payrollBodySchema.refine(
  (value) => Boolean(value.group_id || value.group),
  {
    message: "Informe group_id ou group durante a compatibilidade.",
  },
);

export const updatePayrollBodySchema = payrollBodySchema
  .omit({ client_id: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  })
  .refine((value) => !(value.group_id && value.group), {
    message: "Informe somente group_id ou group.",
  });

export type CreatePayrollBody = z.infer<typeof createPayrollBodySchema>;
export type UpdatePayrollBody = z.infer<typeof updatePayrollBodySchema>;
