import { z } from "zod";

const identity = z.string().trim().min(1).max(200);

export const createMarketingPasswordBodySchema = z
  .object({
    local: identity,
    user: identity,
    password: z.string().min(1).max(4_000),
    notes: z.string().max(5_000).nullable().optional(),
  })
  .strict();

export const updateMarketingPasswordBodySchema = z
  .object({
    local: identity.optional(),
    user: identity.optional(),
    password: z.string().min(1).max(4_000).optional(),
    notes: z.string().max(5_000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  });

export const marketingPasswordIdParamsSchema = z.object({ id: z.string().uuid() });

export const marketingPasswordConfirmationSchema = z
  .object({ confirmed: z.literal(true) })
  .strict();

export const importMarketingPasswordsBodySchema = z
  .object({ records: z.array(z.unknown()).min(1).max(1_000) })
  .strict();
