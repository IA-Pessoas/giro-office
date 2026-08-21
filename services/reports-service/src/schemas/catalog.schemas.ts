import { z } from "zod";

import {
  REPORT_AGGREGATIONS,
  REPORT_FILTER_OPERATORS,
  REPORT_VALUE_TYPES,
  type ReportCatalogRelation,
  type ReportCatalogSource,
} from "../catalog/types.js";

export const reportSourceKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/u, "Fonte inválida.");
export const reportValueTypeSchema = z.enum(REPORT_VALUE_TYPES);
export const reportFilterOperatorSchema = z.enum(REPORT_FILTER_OPERATORS);
export const reportAggregationSchema = z.enum(REPORT_AGGREGATIONS);

export const reportCatalogFieldSchema = z
  .object({
    key: z.string().trim().min(1),
    label: z.string().trim().min(1),
    value_type: reportValueTypeSchema,
    filter_operators: z.array(reportFilterOperatorSchema).min(1),
    aggregations: z.array(reportAggregationSchema),
  })
  .strict();

export const reportCatalogSourceSchema = z
  .object({
    key: reportSourceKeySchema,
    label: z.string().trim().min(1),
    module: z.string().trim().min(1),
    minimum_permission: z.number().int().min(1).max(3),
    fields: z.array(reportCatalogFieldSchema).min(1),
  })
  .strict();

export const reportCatalogRelationSchema = z
  .object({
    key: z.string().trim().min(1),
    sources: z.tuple([reportSourceKeySchema, reportSourceKeySchema]),
    cardinality: z.enum(["one_to_one", "one_to_many", "many_to_one"]),
  })
  .strict();

export function parseReportCatalogSource(value: unknown): ReportCatalogSource {
  return reportCatalogSourceSchema.parse(value);
}

export function parseReportCatalogRelation(value: unknown): ReportCatalogRelation {
  return reportCatalogRelationSchema.parse(value);
}
