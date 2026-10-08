import { z } from "zod";
import {
  reportAggregationSchema,
  reportFilterOperatorSchema,
  reportSourceKeySchema,
} from "./catalog.schemas.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";
import { reportLetterheadReferenceSchema } from "./reportLetterhead.schemas.js";

export const MAX_REPORT_AREAS = 32;
export const MAX_REPORT_AREA_FIELDS = 100;

export const reportCompositionV2Schema = z
  .object({
    version: z.literal(2),
    letterhead: reportLetterheadReferenceSchema.optional(),
    areas: z
      .array(
        z
          .object({
            source: reportSourceKeySchema,
            filters: z
              .array(
                z
                  .object({
                    field: z.string().min(1).max(64),
                    operator: reportFilterOperatorSchema,
                    value: z.union([
                      z.string().max(2048),
                      z.number().finite(),
                      z.boolean(),
                      z.null(),
                      z
                        .array(
                          z.union([
                            z.string().max(2048),
                            z.number().finite(),
                            z.boolean(),
                            z.null(),
                          ]),
                        )
                        .max(100),
                    ]),
                  })
                  .strict(),
              )
              .max(100)
              .optional(),
            filterLogic: z.enum(["and", "or"]).optional(),
            parameterValues: z.record(z.unknown()).optional(),
            groupBy: z.array(z.string().min(1).max(64)).max(25).optional(),
            aggregations: z
              .array(
                z
                  .object({
                    field: z.string().min(1).max(64),
                    function: z.union([reportAggregationSchema, z.literal("count_rows")]),
                    alias: z.string().optional(),
                  })
                  .strict(),
              )
              .max(25)
              .optional(),
            orderBy: z
              .array(
                z
                  .object({ field: z.string().min(1).max(64), direction: z.enum(["asc", "desc"]) })
                  .strict(),
              )
              .max(25)
              .optional(),
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

const fieldKey = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/u);
const v3MeasureSchema = z
  .object({
    key: fieldKey,
    function: z.enum(["count_rows", "count", "sum", "avg", "min", "max"]),
    field: fieldKey.optional(),
  })
  .strict();
const v3OrderSchema = z
  .object({
    field: fieldKey.optional(),
    measure: fieldKey.optional(),
    direction: z.enum(["asc", "desc"]),
  })
  .strict();
const v3AreaSchema = z
  .object({
    source: reportSourceKeySchema,
    layout: z.enum(["grouped_list", "summary"]),
    dimensions: z.array(fieldKey).min(1).max(25),
    details: z.array(fieldKey).max(25),
    measures: z.array(v3MeasureSchema).max(25),
    filters: z
      .array(
        z
          .object({
            field: fieldKey,
            operator: reportFilterOperatorSchema,
            value: z.union([
              z.string().max(2048),
              z.number().finite(),
              z.boolean(),
              z.null(),
              z
                .array(z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()]))
                .max(100),
            ]),
          })
          .strict(),
      )
      .max(100)
      .optional(),
    filterLogic: z.enum(["and", "or"]).optional(),
    parameterValues: z.record(z.unknown()).optional(),
    orderBy: z.array(v3OrderSchema).max(25).optional(),
    display: z
      .object({
        columns: z.array(fieldKey).min(1).max(25),
        groupHeadings: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const reportCompositionV3Schema = z
  .object({
    version: z.literal(3),
    letterhead: reportLetterheadReferenceSchema.optional(),
    areas: z.array(v3AreaSchema).min(1).max(MAX_REPORT_AREAS),
  })
  .strict();

export const reportCompositionSchema = z
  .discriminatedUnion("version", [reportCompositionV2Schema, reportCompositionV3Schema])
  .superRefine((definition, context) => {
    if (definition.version !== 3) return;
    if (new Set(definition.areas.map((area) => area.source)).size !== definition.areas.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Escolha cada área apenas uma vez.",
      });
    }
    for (const [index, area] of definition.areas.entries()) {
      const measureKeys = area.measures.map((measure) => measure.key);
      const available = new Set([...area.dimensions, ...area.details, ...measureKeys]);
      if (
        new Set(area.dimensions).size !== area.dimensions.length ||
        new Set(area.details).size !== area.details.length ||
        new Set(measureKeys).size !== measureKeys.length ||
        measureKeys.some((key) => area.dimensions.includes(key) || area.details.includes(key)) ||
        area.display.columns.some((key) => !available.has(key)) ||
        new Set(area.display.columns).size !== area.display.columns.length ||
        area.measures.some((measure) =>
          measure.function === "count_rows" ? measure.field !== undefined : !measure.field,
        ) ||
        area.orderBy?.some(
          (order) =>
            Boolean(order.field) === Boolean(order.measure) ||
            (order.measure
              ? !measureKeys.includes(order.measure) || area.layout === "grouped_list"
              : ![...area.dimensions, ...area.details].includes(order.field ?? "")),
        ) ||
        (area.layout === "grouped_list" &&
          (area.details.length === 0 ||
            !area.details.some((key) => area.display.columns.includes(key)) ||
            area.measures.length > 0 ||
            !area.display.groupHeadings)) ||
        (area.layout === "summary" && (area.details.length > 0 || area.measures.length === 0))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["areas", index],
          message: "Confira os papéis, medidas, ordem e colunas desta área.",
        });
      }
    }
  });

export const validateReportDefinitionBodySchema = z
  .object({
    definition: z.union([reportCompositionSchema, reportDefinitionSchema]),
  })
  .strict();

export type ReportComposition = z.infer<typeof reportCompositionSchema>;
export type ReportCompositionV2 = z.infer<typeof reportCompositionV2Schema>;
export type ReportCompositionV3 = z.infer<typeof reportCompositionV3Schema>;
