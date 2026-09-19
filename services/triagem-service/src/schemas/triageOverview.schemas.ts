import { z } from "zod";

const competenceSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM.");

const clientIdSchema = z.string().uuid("Cliente inválido.");

const pageSchema = z.preprocess(
  (value) => (value === undefined ? 1 : Number(value)),
  z.number().int().min(1),
);

const pageSizeSchema = z.preprocess(
  (value) => (value === undefined ? 20 : Number(value)),
  z.number().int().min(1).max(100),
);

export const TRIAGE_OVERVIEW_STATUS_VALUES = [
  "URGENT_OPEN",
  "ROUTINE_PENDING",
  "BANK_PENDING",
  "COMPLETE",
] as const;

export const listTriageOverviewQuerySchema = z
  .object({
    page: pageSchema,
    page_size: pageSizeSchema,
    client_id: clientIdSchema.optional(),
    competence: competenceSchema.optional(),
    status: z.enum(TRIAGE_OVERVIEW_STATUS_VALUES).optional(),
  })
  .strict();
