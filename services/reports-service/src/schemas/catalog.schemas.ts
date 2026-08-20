import { z } from "zod";

import {
  REPORT_AGGREGATIONS,
  REPORT_FILTER_OPERATORS,
  REPORT_SOURCE_KEYS,
  REPORT_VALUE_TYPES,
  type ReportCatalogRelation,
  type ReportCatalogSource,
} from "../catalog/types.js";

export const reportSourceKeySchema = z.enum(REPORT_SOURCE_KEYS);
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
    module: z.enum(["parcelamento", "integracao"]),
    fields: z.array(reportCatalogFieldSchema).min(1),
    internal_keys: z.array(z.string().trim().min(1)),
  })
  .strict();

export const reportCatalogRelationSchema = z
  .object({
    key: z.string().trim().min(1),
    sources: z.tuple([reportSourceKeySchema, reportSourceKeySchema]),
  })
  .strict();

export const REPORT_CATALOG: readonly ReportCatalogSource[] = [
  {
    key: "parcelamento.installments",
    label: "Acordos de parcelamento",
    module: "parcelamento",
    fields: [
      {
        key: "agreement_number",
        label: "Número do acordo",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
      {
        key: "status",
        label: "Situação",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
      {
        key: "total_amount",
        label: "Valor total",
        value_type: "number",
        filter_operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
        aggregations: ["count", "sum", "avg", "min", "max"],
      },
      {
        key: "installment_count",
        label: "Quantidade de parcelas",
        value_type: "number",
        filter_operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
        aggregations: ["count", "sum", "avg", "min", "max"],
      },
    ],
    internal_keys: ["client_id"],
  },
  {
    key: "parcelamento.installment_competencies",
    label: "Competências de parcelamento",
    module: "parcelamento",
    fields: [
      {
        key: "competence",
        label: "Competência",
        value_type: "date",
        filter_operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
        aggregations: ["count", "min", "max"],
      },
      {
        key: "overdue_installments",
        label: "Parcelas em atraso",
        value_type: "number",
        filter_operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
        aggregations: ["count", "sum", "avg", "min", "max"],
      },
    ],
    internal_keys: ["installment_id"],
  },
  {
    key: "parcelamento.panoramas",
    label: "Panoramas de parcelamento",
    module: "parcelamento",
    fields: [
      {
        key: "competence",
        label: "Competência",
        value_type: "date",
        filter_operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"],
        aggregations: ["count", "min", "max"],
      },
      {
        key: "fiscal_status",
        label: "Situação fiscal",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
    ],
    internal_keys: ["client_id"],
  },
  {
    key: "integracao.clients",
    label: "Clientes",
    module: "integracao",
    fields: [
      {
        key: "name",
        label: "Nome",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
      {
        key: "status",
        label: "Situação",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
      {
        key: "city",
        label: "Cidade",
        value_type: "string",
        filter_operators: ["eq", "neq", "contains", "in"],
        aggregations: ["count"],
      },
      {
        key: "state",
        label: "Estado",
        value_type: "string",
        filter_operators: ["eq", "neq", "in"],
        aggregations: ["count"],
      },
    ],
    internal_keys: ["client_id"],
  },
];

export const REPORT_CATALOG_RELATIONS: readonly ReportCatalogRelation[] = [
  {
    key: "parcelamento.installments.client",
    sources: ["parcelamento.installments", "integracao.clients"],
  },
];
