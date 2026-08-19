import { z } from "zod";

import {
  REPORT_CATALOG,
  REPORT_CATALOG_RELATIONS,
  reportAggregationSchema,
  reportFilterOperatorSchema,
  reportSourceKeySchema,
} from "./catalog.schemas.js";

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
    relation: z.enum(["parcelamento.installments.client"]),
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
    source: reportSourceKeySchema,
    field: fieldNameSchema,
    function: reportAggregationSchema,
  })
  .strict();

const declaredCostSchema = z
  .object({
    rows: z.number().int().min(0).max(MAX_DECLARED_REPORT_ROWS),
    bytes: z.number().int().min(0).max(MAX_DECLARED_REPORT_BYTES),
  })
  .strict();

function findField(source: string, field: string) {
  return REPORT_CATALOG.find((candidate) => candidate.key === source)?.fields.find(
    (candidate) => candidate.key === field,
  );
}

export const reportDefinitionSchema = z
  .object({
    sources: z.array(reportSourceKeySchema).min(1).max(MAX_REPORT_SOURCES),
    columns: z.array(columnSchema).min(1).max(MAX_REPORT_COLUMNS),
    joins: z.array(joinSchema).max(MAX_REPORT_JOINS).default([]),
    filters: z.array(filterSchema).default([]),
    filter_groups: z.array(filterGroupSchema).default([]),
    parameters: z.array(parameterSchema).default([]),
    aggregations: z.array(aggregationSchema).default([]),
    declared_cost: declaredCostSchema.optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    const sourceSet = new Set(definition.sources);
    const aliases = new Set<string>();
    const parameters = new Map(
      definition.parameters.map((parameter) => [parameter.name, parameter]),
    );
    const filters = new Set(definition.filters.map((filter) => filter.parameter));

    if (sourceSet.size !== definition.sources.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "As fontes devem ser únicas." });
    }

    for (const [index, column] of definition.columns.entries()) {
      if (!sourceSet.has(column.source) || !findField(column.source, column.field)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["columns", index],
          message: "A coluna deve ser publicada pela fonte selecionada.",
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

    for (const [index, join] of definition.joins.entries()) {
      const relation = REPORT_CATALOG_RELATIONS.find(
        (candidate) => candidate.key === join.relation,
      );
      if (!relation || relation.sources.some((source) => !sourceSet.has(source))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["joins", index],
          message: "A relação deve usar fontes selecionadas e publicadas.",
        });
      }
    }

    for (const [index, filter] of definition.filters.entries()) {
      const field = findField(filter.source, filter.field);
      const parameter = parameters.get(filter.parameter);
      if (
        !sourceSet.has(filter.source) ||
        !field ||
        !field.filter_operators.includes(filter.operator)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["filters", index],
          message: "O operador deve ser compatível com um campo publicado.",
        });
      }
      if (!parameter || parameter.type !== field?.value_type) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["filters", index, "parameter"],
          message: "O filtro deve referenciar um parâmetro compatível.",
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
      const field = findField(aggregation.source, aggregation.field);
      if (
        !sourceSet.has(aggregation.source) ||
        !field ||
        !field.aggregations.includes(aggregation.function)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["aggregations", index],
          message: "A agregação deve ser compatível com um campo publicado.",
        });
      }
    }
  });

export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
