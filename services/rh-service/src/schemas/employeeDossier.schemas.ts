import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const uuid = z.string().uuid("id inválido.");
const optionalNullableText = (fieldName: string) => zNonEmptyText(fieldName).nullable().optional();

export const dossierTargetQuerySchema = z
  .object({
    user_id: uuid.optional(),
  })
  .strict();

export const dossierListQuerySchema = z
  .object({
    department_id: uuid.optional(),
  })
  .strict();

export const allergySchema = z
  .object({
    name: zNonEmptyText("name"),
    fonts: zNonEmptyText("fonts"),
    action: zNonEmptyText("action"),
  })
  .strict();

export const replaceAllergiesBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    allergies: z.array(allergySchema),
  })
  .strict();

export const contactTargetBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    name: zNonEmptyText("name"),
    phone: zNonEmptyText("phone"),
    reference: zNonEmptyText("reference").optional(),
  })
  .strict();

export const contactUpdateBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    id: uuid,
    name: zNonEmptyText("name").optional(),
    phone: zNonEmptyText("phone").optional(),
    reference: zNonEmptyText("reference").nullable().optional(),
  })
  .strict()
  .refine(
    ({ name, phone, reference }) =>
      name !== undefined || phone !== undefined || reference !== undefined,
    {
      message: "Informe ao menos um campo para atualizar o contato.",
    },
  );

export const contactDeleteBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    id: uuid,
  })
  .strict();

export const dossierUpdateBodySchema = z
  .object({
    target_user_id: uuid.optional(),
    full_name: optionalNullableText("full_name"),
    gender: optionalNullableText("gender"),
    birth_date: zIsoDate("birth_date").nullable().optional(),
    cpf: optionalNullableText("cpf"),
    rg: optionalNullableText("rg"),
    address: optionalNullableText("address"),
    job_title: optionalNullableText("job_title"),
    email: z.string().trim().email("email inválido.").nullable().optional(),
    phone: optionalNullableText("phone"),
    hire_date: zIsoDate("hire_date").nullable().optional(),
    dominio_hire_date: zIsoDate("dominio_hire_date").nullable().optional(),
    termination_date: zIsoDate("termination_date").nullable().optional(),
    photo_url: z.string().trim().url("photo_url inválida.").nullable().optional(),
    status: zNonEmptyText("status").optional(),
    department_id: uuid.optional(),
  })
  .strict();

export type AllergyInput = z.infer<typeof allergySchema>;
export type ContactCreateInput = z.infer<typeof contactTargetBodySchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateBodySchema>;
export type ContactDeleteInput = z.infer<typeof contactDeleteBodySchema>;
export type DossierUpdateInput = z.infer<typeof dossierUpdateBodySchema>;
