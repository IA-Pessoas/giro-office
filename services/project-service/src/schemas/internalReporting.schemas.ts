import { PROJECT_REPORTING_SOURCES } from "@workspace/shared";
import { z } from "zod";

const reportingFieldSchema = z.string().trim().min(1).max(64);

export const internalReportingExtractBodySchema = z
  .object({
    source: z.enum(PROJECT_REPORTING_SOURCES),
    fields: z.array(reportingFieldSchema).min(1).max(25),
    limit: z.number().int().min(1).max(101),
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
    audience: z.literal("project-service"),
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
  });

export type InternalReportingGrant = z.infer<typeof internalReportingGrantSchema>;
