import { z } from "zod";

import { reportCompositionSchema } from "./reportComposition.schemas.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const reportModelDefinitionSchema = z.union([
  reportCompositionSchema,
  reportDefinitionSchema,
]);
export type ReportModelDefinition = z.infer<typeof reportModelDefinitionSchema>;

const descriptionSchema = z.string().trim().max(240).nullable().optional();

export const createReportModelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: descriptionSchema,
    definition: reportModelDefinitionSchema,
  })
  .strict();

export const reportModelSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    description: descriptionSchema,
    version: z.number().int().positive(),
    version_id: z.string().uuid().optional(),
    definition: reportModelDefinitionSchema,
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
    description: descriptionSchema,
    definition: reportModelDefinitionSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.definition !== undefined,
    {
      message: "Informe nome, descrição ou definição para atualizar o modelo.",
    },
  );

export type CreateReportModel = z.infer<typeof createReportModelSchema>;
export type UpdateReportModel = z.infer<typeof updateReportModelSchema>;
export type ReportModel = z.infer<typeof reportModelSchema>;
