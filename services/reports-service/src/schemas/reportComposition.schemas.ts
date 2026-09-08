import { z } from "zod";
import { reportSourceKeySchema } from "./catalog.schemas.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const MAX_REPORT_AREAS = 32;
export const MAX_REPORT_AREA_FIELDS = 100;

export const reportCompositionSchema = z
  .object({
    version: z.literal(2),
    areas: z
      .array(
        z
          .object({
            source: reportSourceKeySchema,
            fields: z
              .array(z.string().min(1).max(64))
              .min(1, "Escolha ao menos um campo em cada área.")
              .max(MAX_REPORT_AREA_FIELDS, "Reduza a quantidade de campos desta área.")
              .refine(
                (fields) => new Set(fields).size === fields.length,
                "Escolha cada campo apenas uma vez.",
              ),
          })
          .strict(),
      )
      .min(1, "Escolha ao menos uma área.")
      .max(MAX_REPORT_AREAS, "Reduza a quantidade de áreas para continuar.")
      .refine(
        (areas) => new Set(areas.map((area) => area.source)).size === areas.length,
        "Escolha cada área apenas uma vez.",
      ),
  })
  .strict();

export const validateReportDefinitionBodySchema = z
  .object({
    definition: z.union([reportCompositionSchema, reportDefinitionSchema]),
  })
  .strict();

export type ReportComposition = z.infer<typeof reportCompositionSchema>;
