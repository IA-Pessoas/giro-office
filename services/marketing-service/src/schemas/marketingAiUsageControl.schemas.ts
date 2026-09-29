import { z } from "zod";

const competenceSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");

export const createMarketingAiUsageControlBodySchema = z.object({
  userId: z.string().uuid(),
  competence: competenceSchema,
});

export const createMarketingAiUsageControlsBatchBodySchema = z.object({
  competence: competenceSchema,
});

export const marketingAiUsageControlQuerySchema = z.object({ competence: competenceSchema });

export const marketingAiUsageControlIdParamsSchema = z.object({ id: z.string().uuid() });

export const updateMarketingAiUsageControlBodySchema = z
  .object({
    knowledge: z.boolean().nullable().optional(),
    integration: z.boolean().nullable().optional(),
    frequency: z.number().int().min(1).max(10).nullable().optional(),
    purpose: z.string().max(5_000).nullable().optional(),
    perceived_gain: z.string().max(5_000).nullable().optional(),
  })
  .refine((answers) => Object.values(answers).some((value) => value !== undefined), {
    message: "Informe ao menos uma resposta.",
  });

const legacyRecordSchema = z.object({
  legacyUserId: z.string().min(1).max(100),
  competence: z.string().min(1).max(32),
  knowledge: z
    .boolean()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  integration: z
    .boolean()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  frequency: z
    .number()
    .int()
    .min(1)
    .max(10)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  purpose: z
    .string()
    .max(5_000)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
  perceived_gain: z
    .string()
    .max(5_000)
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export const importMarketingAiUsageControlsBodySchema = z.object({
  records: z.array(legacyRecordSchema).min(1).max(1_000),
});
