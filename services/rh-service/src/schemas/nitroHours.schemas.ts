import { z } from "zod";
import { RhNitroHoursStatus } from "../generated/prisma/client.js";

const quarterSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-Q[1-4]$/u, "quarter inválido.");

export const submitNitroHoursBodySchema = z
  .object({
    quarter: quarterSchema,
    hours: z.coerce.number().int().min(1).max(1000),
  })
  .strict();

export const listNitroHoursQuerySchema = z
  .object({
    quarter: quarterSchema.optional(),
    user_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const nitroHoursIdParamsSchema = z
  .object({ id: z.string().uuid({ message: "id inválido." }) })
  .strict();

export const decideNitroHoursBodySchema = z
  .object({
    status: z.enum([RhNitroHoursStatus.Accepted, RhNitroHoursStatus.Rejected]),
    rejection_reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => value.status !== RhNitroHoursStatus.Rejected || Boolean(value.rejection_reason),
    {
      message: "Informe o motivo da rejeição.",
      path: ["rejection_reason"],
    },
  );
