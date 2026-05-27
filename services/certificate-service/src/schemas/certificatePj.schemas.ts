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

export const certificatePjListQuerySchema = z
  .object({
    ...paginationQueryFields,
    name: z.string().optional(),
    cnpj: z.string().optional(),
    responsible: z.string().optional(),
    model: z.string().optional(),
    client_castelo_status: optionalQueryBoolean,
    client_focus_status: optionalQueryBoolean,
    was_paid: optionalQueryBoolean,
    has_certificate: optionalQueryBoolean,
  })
  .strict();

export const certificatePjIdParamSchema = z
  .object({
    id: z.string().uuid({ message: "Certificado PJ invalido." }),
  })
  .strict();

export const createCertificatePjSchema = z
  .object({
    client_castelo_status: strictBooleanSchema,
    client_focus_status: strictBooleanSchema,
    name: zNonEmptyText("name"),
    cnpj: zNonEmptyText("cnpj"),
    responsible: zNonEmptyText("responsible"),
    model: zNonEmptyText("model"),
    legal_nature: zNonEmptyText("legal_nature"),
    password: zNonEmptyText("password"),
    expiration_date: z.coerce.date(),
    notes: optionalNullableText,
    was_paid: strictBooleanSchema,
    payment_date: optionalNullableDate,
    payment_amount: optionalNullableNumber,
    contact_info: optionalNullableText,
    file_path: optionalNullableText,
    has_certificate: strictBooleanSchema,
  })
  .strict();

export const updateCertificatePjSchema = z
  .object({
    client_castelo_status: strictBooleanSchema.optional(),
    client_focus_status: strictBooleanSchema.optional(),
    name: zNonEmptyText("name").optional(),
    cnpj: zNonEmptyText("cnpj").optional(),
    responsible: zNonEmptyText("responsible").optional(),
    model: zNonEmptyText("model").optional(),
    legal_nature: zNonEmptyText("legal_nature").optional(),
    password: zNonEmptyText("password").optional(),
    expiration_date: z.coerce.date().optional(),
    notes: optionalNullableText,
    was_paid: strictBooleanSchema.optional(),
    payment_date: optionalNullableDate,
    payment_amount: optionalNullableNumber,
    contact_info: optionalNullableText,
    file_path: optionalNullableText,
    has_certificate: strictBooleanSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CertificatePjListQuery = z.infer<typeof certificatePjListQuerySchema>;
export type CreateCertificatePjInput = z.infer<typeof createCertificatePjSchema>;
export type UpdateCertificatePjInput = z.infer<typeof updateCertificatePjSchema>;
