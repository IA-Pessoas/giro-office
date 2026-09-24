import {
  MAX_REPORTING_QUERY_LIMIT,
  reportingQuerySchema,
  TI_EXTENSIONS_REPORTING_SOURCES,
  TI_INVENTORY_REPORTING_SOURCES,
  TI_REQUESTS_REPORTING_SOURCES,
  TI_STOCK_REPORTING_SOURCES,
} from "@workspace/shared";
import { z } from "zod";

const reportingFieldSchema = z.string().trim().min(1).max(64);
const TI_REPORTING_SOURCES = [
  ...TI_EXTENSIONS_REPORTING_SOURCES,
  ...TI_INVENTORY_REPORTING_SOURCES,
  ...TI_REQUESTS_REPORTING_SOURCES,
  ...TI_STOCK_REPORTING_SOURCES,
] as const;

export const internalReportingExtractBodySchema = z
  .object({
    query: reportingQuerySchema.optional(),
    source: z.enum(TI_REPORTING_SOURCES),
    fields: z.array(reportingFieldSchema).min(1).max(25),
    limit: z.number().int().min(1).max(MAX_REPORTING_QUERY_LIMIT),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.fields).size !== value.fields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields"],
        message: "Campos duplicados.",
      });
    }
  });

export const internalReportingGrantSchema = z
  .object({
    version: z.literal(1),
    audience: z.literal("ti-service"),
    operation: z.enum(["catalog", "extract"]),
    source: z.string().trim().min(1).max(128),
    organization_id: z.string().uuid("organization_id inválido."),
    fields: z.array(reportingFieldSchema).max(25),
    request_id: z.string().trim().min(1).max(128),
    issued_at: z.number().int().nonnegative(),
    expires_at: z.number().int().nonnegative(),
    body_sha256: z.string().regex(/^[a-f0-9]{64}$/u, "body_sha256 inválido."),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.fields).size !== value.fields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fields"],
        message: "Campos duplicados.",
      });
    }
    if (value.expires_at - value.issued_at > 60) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "TTL máximo é 60 segundos.",
      });
    }
    if (value.expires_at <= value.issued_at) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "O grant deve expirar depois da emissão.",
      });
    }
  });

export type InternalReportingGrant = z.infer<typeof internalReportingGrantSchema>;
