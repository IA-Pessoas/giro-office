import { z } from "zod";

import { idQuerySchema } from "./common.schemas.js";

const PART_RANGE_MESSAGE = "Participação deve ser maior que 0% e no máximo 100%.";

// Data completa (AAAA-MM-DD, com hora opcional). Local em vez de zIsoDate do shared, que aceita
// "2024-01" e "2024-02-31" rolando para outra data em silêncio.
function partnerDate(label: string) {
  const message = `Informe a data de ${label} completa (dd/mm/aaaa).`;
  return z
    .string({ required_error: message, invalid_type_error: message })
    .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, message)
    .refine((value) => {
      const day = value.slice(0, 10);
      const date = new Date(day);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day;
    }, message)
    .transform((value) => new Date(value));
}

const partnerFields = z
  .object({
    pj_id: z.string().uuid("pj_id invalido."),
    pf_id: z.string().uuid("pf_id invalido."),
    part: z.coerce
      .number({ invalid_type_error: "Informe a participação em %." })
      .gt(0, PART_RANGE_MESSAGE)
      .max(100, PART_RANGE_MESSAGE),
    entry: partnerDate("entrada"),
    exit: partnerDate("saída").optional(),
  })
  .strict();

function exitNotBeforeEntry<T extends { entry: Date; exit?: Date }>(body: T, ctx: z.RefinementCtx) {
  if (body.exit && body.exit < body.entry) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exit"],
      message: "Data de saída não pode ser anterior à entrada.",
    });
  }
}

export const createPartnerBodySchema = partnerFields.superRefine(exitNotBeforeEntry);

export const updatePartnerBodySchema = partnerFields
  .extend({
    id: z.string().uuid("id invalido."),
  })
  .strict()
  .superRefine(exitNotBeforeEntry);

export const partnerDetailQuerySchema = idQuerySchema;

export const partnerIdParamsSchema = z
  .object({
    id: z.string().uuid("id invalido."),
  })
  .strict();

export const listPartnersQuerySchema = z
  .object({
    type: z.enum(["pf", "pj"]),
    client_id: z.string().uuid("client_id invalido."),
  })
  .strict();

export type CreatePartnerBody = z.infer<typeof createPartnerBodySchema>;
export type UpdatePartnerBody = z.infer<typeof updatePartnerBodySchema>;
