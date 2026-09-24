import { createHash } from "node:crypto";

import { z } from "zod";

import { REPORT_LIFECYCLE_STATUSES } from "../services/reportLifecycleService.js";
import { reportCompositionSchema } from "./reportComposition.schemas.js";
import { reportDefinitionSchema } from "./reportDefinition.schemas.js";

export const reportJobStatusSchema = z.enum(REPORT_LIFECYCLE_STATUSES);

export const createReportJobSchema = z
  .object({
    definition: z.union([reportCompositionSchema, reportDefinitionSchema]).optional(),
    modelVersionId: z.string().uuid().optional(),
    parameterValues: z.record(z.string(), z.unknown()).optional(),
    format: z.enum(["json", "csv"]).default("json"),
  })
  .strict()
  .refine((value) => Boolean(value.definition) !== Boolean(value.modelVersionId), {
    message: "Informe definition ou modelVersionId, mas não ambos.",
  });

export const reportJobIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

export const reportJobIdempotencyKeySchema = z
  .string()
  .trim()
  .min(1, "Idempotency-Key não pode ser vazia.")
  .max(255, "Idempotency-Key deve ter no máximo 255 caracteres.");

export const reportJobSchema = z
  .object({
    id: z.string().uuid(),
    organization_id: z.string().uuid(),
    requester_id: z.string().uuid(),
    status: reportJobStatusSchema,
    requested_at: z.coerce.date(),
  })
  .strict();

export type CreateReportJob = z.infer<typeof createReportJobSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createReportJobIdempotencyHash(input: {
  definition?: CreateReportJob["definition"];
  modelVersionId?: string;
  parameterValues?: Record<string, unknown>;
  format: CreateReportJob["format"];
}): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}
