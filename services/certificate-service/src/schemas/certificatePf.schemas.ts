import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

import { paginationQueryFields } from "./pagination.schemas.js";

function parseBooleanInput(value: unknown): unknown {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  return value;
}

const strictBooleanSchema = z.preprocess(parseBooleanInput, z.boolean());
const optionalQueryBoolean = strictBooleanSchema.optional();
const optionalNullableText = z.string().nullable().optional();
const optionalNullableDate = z.coerce.date().nullable().optional();
const optionalNullableNumber = z.coerce.number().nullable().optional();

export const certificatePfListQuerySchema = z
  .object({
    ...paginationQueryFields,
    search: z.string().optional(),
    name: z.string().optional(),
    cpf: z.string().optional(),
    enterprise: z.string().optional(),
    cnpj: z.string().optional(),
    model: z.string().optional(),
    client_castelo_status: optionalQueryBoolean,
    client_focus_status: optionalQueryBoolean,
    was_paid: optionalQueryBoolean,
    has_certificate: optionalQueryBoolean,
  })
  .strict();

export const certificatePfIdParamSchema = z
  .object({
    id: z.string().uuid({ message: "Certificado PF invalido." }),
  })
  .strict();

export const createCertificatePfSchema = z
  .object({
    client_castelo_status: strictBooleanSchema,
    client_focus_status: strictBooleanSchema,
    name: zNonEmptyText("name"),
    cpf: zNonEmptyText("cpf"),
    model: zNonEmptyText("model"),
    password: zNonEmptyText("password"),
    expiration_date: z.coerce.date(),
    notes: optionalNullableText,
    enterprise: optionalNullableText,
    cnpj: optionalNullableText,
    was_paid: strictBooleanSchema,
    payment_date: optionalNullableDate,
    payment_amount: optionalNullableNumber,
    contact_info: optionalNullableText,
  })
  .strict();

export const updateCertificatePfSchema = z
  .object({
    client_castelo_status: strictBooleanSchema.optional(),
    client_focus_status: strictBooleanSchema.optional(),
    name: zNonEmptyText("name").optional(),
    cpf: zNonEmptyText("cpf").optional(),
    model: zNonEmptyText("model").optional(),
    password: zNonEmptyText("password").optional(),
    expiration_date: z.coerce.date().optional(),
    notes: optionalNullableText,
    enterprise: optionalNullableText,
    cnpj: optionalNullableText,
    was_paid: strictBooleanSchema.optional(),
    payment_date: optionalNullableDate,
    payment_amount: optionalNullableNumber,
    contact_info: optionalNullableText,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CertificatePfListQuery = z.infer<typeof certificatePfListQuerySchema>;
export type CreateCertificatePfInput = z.infer<typeof createCertificatePfSchema>;
export type UpdateCertificatePfInput = z.infer<typeof updateCertificatePfSchema>;
