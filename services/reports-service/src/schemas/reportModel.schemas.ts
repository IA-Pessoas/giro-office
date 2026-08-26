import { z } from "zod";

import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const createReportModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    definition: reportDefinitionSchema,
  })
  .strict();

export const reportModelSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    version: z.number().int().positive(),
    definition: reportDefinitionSchema,
  })
  .strict();

export const reportModelIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const updateReportModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    definition: reportDefinitionSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.definition !== undefined, {
    message: "Informe nome ou definição para atualizar o modelo.",
  });

export type CreateReportModel = z.infer<typeof createReportModelSchema>;
export type UpdateReportModel = z.infer<typeof updateReportModelSchema>;
export type ReportModel = z.infer<typeof reportModelSchema>;
