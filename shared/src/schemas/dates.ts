import { z } from "zod";

/** Data a partir de string ISO (body JSON); falha no refine se inválida. */
export function zIsoDate(fieldName: string) {
  return z
    .string({
      required_error: `${fieldName} é obrigatório.`,
      invalid_type_error: `${fieldName} deve ser uma string.`,
    })
    .trim()
    .min(1, `${fieldName} é obrigatório.`)
    .transform((s: string) => new Date(s))
    .refine((d: Date) => !Number.isNaN(d.getTime()), `${fieldName} inválido.`);
}
