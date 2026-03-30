import { z } from "zod";

/** Aceita string ISO (data ou data-hora) ou valor coercível e produz `Date` válido. */
export function zIsoDate(field: string) {
  return z.coerce
    .date({
      required_error: `${field} é obrigatório.`,
      invalid_type_error: `${field} inválido.`,
    })
    .refine((d) => !Number.isNaN(d.getTime()), { message: `${field} inválido.` });
}
