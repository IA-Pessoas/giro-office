import { z } from "zod";

import {
  reportAggregationSchema,
  reportFilterOperatorSchema,
  reportSourceKeySchema,
} from "./catalog.schemas.js";
import { reportLetterheadReferenceSchema } from "./reportLetterhead.schemas.js";

export const MAX_REPORT_SOURCES = 2;
export const MAX_REPORT_COLUMNS = 25;
export const MAX_REPORT_JOINS = 1;
export const MAX_DECLARED_REPORT_ROWS = 50_000;
export const MAX_DECLARED_REPORT_BYTES = 20 * 1024 * 1024;

const parameterTypeSchema = z.enum(["string", "number", "boolean", "date"]);
const parameterNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/u);
const fieldNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/u);
const aliasSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/u);

const columnSchema = z
  .object({
    source: reportSourceKeySchema,
    field: fieldNameSchema,
    alias: aliasSchema,
  })
  .strict();

const joinSchema = z
  .object({
    relation: z.string(),
    type: z.enum(["inner", "left"]),
  })
  .strict();

const filterSchema = z
  .object({
    source: reportSourceKeySchema,
    field: fieldNameSchema,
    operator: reportFilterOperatorSchema,
    parameter: parameterNameSchema,
  })
  .strict();

const filterGroupSchema = z
  .object({
    operator: z.enum(["and", "or"]),
    filters: z.array(parameterNameSchema).min(1),
  })
  .strict();

const parameterSchema = z
  .object({
    name: parameterNameSchema,
    type: parameterTypeSchema,
  })
  .strict();

const aggregationSchema = z
  .object({
    alias: aliasSchema.optional(),
    source: reportSourceKeySchema,
    field: fieldNameSchema,
    function: z.union([reportAggregationSchema, z.literal("count_rows")]),
  })
  .strict();

const orderBySchema = z
  .object({
    source: reportSourceKeySchema,
    field: fieldNameSchema,
    direction: z.enum(["asc", "desc"]),
  })
  .strict();

const declaredCostSchema = z
  .object({
    rows: z.number().int().min(0).max(MAX_DECLARED_REPORT_ROWS),
    bytes: z.number().int().min(0).max(MAX_DECLARED_REPORT_BYTES),
  })
  .strict();

export const reportDefinitionSchema = z
  .object({
    letterhead: reportLetterheadReferenceSchema.optional(),
    sources: z.array(reportSourceKeySchema).min(1).max(MAX_REPORT_SOURCES),
    columns: z.array(columnSchema).min(1).max(MAX_REPORT_COLUMNS),
    joins: z.array(joinSchema).max(MAX_REPORT_JOINS).default([]),
    filters: z.array(filterSchema).default([]),
    filter_groups: z.array(filterGroupSchema).default([]),
    parameters: z.array(parameterSchema).default([]),
    aggregations: z.array(aggregationSchema).default([]),
    group_by: z
      .array(z.object({ source: reportSourceKeySchema, field: fieldNameSchema }).strict())
      .max(MAX_REPORT_COLUMNS)
      .optional(),
    order_by: z.array(orderBySchema).max(MAX_REPORT_COLUMNS).default([]),
    declared_cost: declaredCostSchema.optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    const sourceSet = new Set(definition.sources);
    const aliases = new Set<string>();
    const parameterNames = new Set(definition.parameters.map((parameter) => parameter.name));
    const filters = new Set(definition.filters.map((filter) => filter.parameter));

    if (sourceSet.size !== definition.sources.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "As fontes devem ser únicas." });
    }
    if (parameterNames.size !== definition.parameters.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Os parâmetros devem ser únicos." });
    }

    for (const [index, column] of definition.columns.entries()) {
      if (!sourceSet.has(column.source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", index],
          message: "A coluna deve usar uma fonte selecionada.",
        });
      }
      if (aliases.has(column.alias)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", index, "alias"],
          message: "Os aliases das colunas devem ser únicos.",
        });
      }
      aliases.add(column.alias);
    }

    for (const [index, filter] of definition.filters.entries()) {
      if (!sourceSet.has(filter.source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["filters", index],
          message: "O filtro deve usar uma fonte selecionada.",
        });
      }
    }

    for (const [index, group] of definition.filter_groups.entries()) {
      if (group.filters.some((parameter) => !filters.has(parameter))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["filter_groups", index],
          message: "O grupo deve referenciar filtros existentes.",
        });
      }
    }

    for (const [index, aggregation] of definition.aggregations.entries()) {
      if (!sourceSet.has(aggregation.source)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aggregations", index],
          message: "A agregação deve usar uma fonte selecionada.",
        });
      }
    }
  });

export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
