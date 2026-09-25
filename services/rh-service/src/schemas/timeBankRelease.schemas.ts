import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createTimeBankReleaseBodySchema = z
  .object({
    user_id: z.string().uuid({ message: "user_id inválido." }),
    date: zIsoDate("date"),
    minutes: z.number().int({ message: "minutes deve ser um número inteiro." }),
    reason: zNonEmptyText("reason"),
  })
  .strict();

export const approveTimeBankReleaseBodySchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

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

export const listTimeBankReleasesQuerySchema = z
  .object({
    user_id: z.string().uuid({ message: "user_id inválido." }).optional(),
    is_approved: z
      .enum(["true", "false"], { message: "is_approved deve ser true ou false." })
      .optional(),
    date_from: optionalIsoDateQuery("date_from"),
    date_to: optionalIsoDateQuery("date_to"),
  })
  .strict();

export const timeBankSummaryUserParamsSchema = z
  .object({
    userId: z.string().uuid({ message: "userId inválido." }),
  })
  .strict();
