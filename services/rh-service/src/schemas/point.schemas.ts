import { z } from "zod";

function optionalIsoDateQuery(field: string) {
  return z.union([
    z.undefined(),
    z
      .string()
      .trim()
      .min(1, `${field} inválido.`)
      .refine((s) => !Number.isNaN(Date.parse(s)), `${field} inválido.`)
      .transform((s: string) => new Date(s)),
  ]);
}

export const pointIdParamsSchema = z
  .object({
    pointId: z.string().uuid({ message: "pointId inválido." }),
  })
  .strict();

export const listPointsQuerySchema = z
  .object({
    date_from: optionalIsoDateQuery("date_from"),
    date_to: optionalIsoDateQuery("date_to"),
    user_id: z.string().uuid({ message: "user_id inválido." }).optional(),
  })
  .strict();

export const pointSummaryQuerySchema = z
  .object({
    month: z
      .string()
      .trim()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "month deve estar no formato YYYY-MM." }),
    user_id: z.string().uuid({ message: "user_id inválido." }).optional(),
  })
  .strict();
