import { z } from "zod";

import { competenceSchema } from "./competence.schemas.js";
import { CONFERENCE_MAX_BASE64_LENGTH } from "./documentConference.schemas.js";
import { paginationQuerySchema } from "./pagination.schemas.js";

// Em classificação → aguardando conferência → conferido; a devolução volta para classificação.
export const ANTICIPATION_BATCH_STATUSES = ["pending_review", "awaiting_check", "checked"] as const;

export type AnticipationBatchStatus = (typeof ANTICIPATION_BATCH_STATUSES)[number];

export const ANTICIPATION_CLASSIFICATIONS = ["partial", "total", "freight"] as const;

export type AnticipationClassification = (typeof ANTICIPATION_CLASSIFICATIONS)[number];

/** Campos extraídos do XML que a revisão pode corrigir; o valor do XML fica preservado. */
export const ANTICIPATION_CORRECTABLE_FIELDS = [
  "ncm",
  "cfop",
  "quantity",
  "value",
  "ipi",
  "icms_st",
] as const;

export type AnticipationCorrectableField = (typeof ANTICIPATION_CORRECTABLE_FIELDS)[number];

// Mesmo teto da seleção de XML (~650 kB de ZIP em base64), dentro do 1 MB do gateway.
export const importAnticipationBatchBodySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    competence: competenceSchema,
    file_name: z.string().trim().min(1, "Informe o nome do arquivo.").max(255),
    zip_base64: z
      .string({ message: "Envie o ZIP." })
      .min(1, "Envie o ZIP.")
      .max(CONFERENCE_MAX_BASE64_LENGTH, "ZIP excede o limite de 650 kB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u, "ZIP em base64 inválido."),
  })
  .strict();

export const anticipationBatchIdParamsSchema = z
  .object({ id: z.string().uuid("Lote inválido.") })
  .strict();

export const listAnticipationBatchesQuerySchema = z
  .object({
    ...paginationQuerySchema.shape,
    client_id: z.string().uuid("Cliente inválido.").optional(),
    competence: competenceSchema.optional(),
  })
  .strict();

export type ImportAnticipationBatchBody = z.infer<typeof importAnticipationBatchBodySchema>;
export type ListAnticipationBatchesQuery = z.infer<typeof listAnticipationBatchesQuerySchema>;

const reasonSchema = z
  .string({ required_error: "Informe o motivo." })
  .trim()
  .min(1, "Informe o motivo.")
  .max(2000, "Motivo deve ter no máximo 2000 caracteres.");

const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,13}(\.\d{1,2})?$/u, "Valor inválido: use até 2 casas decimais com ponto.");

const correctionValueSchemas = {
  ncm: z
    .string()
    .trim()
    .regex(/^\d{8}$/u, "NCM deve ter 8 dígitos."),
  cfop: z
    .string()
    .trim()
    .regex(/^\d{4}$/u, "CFOP deve ter 4 dígitos."),
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,11}(\.\d{1,4})?$/u, "Quantidade inválida: use até 4 casas decimais com ponto."),
  value: moneySchema,
  ipi: moneySchema,
  icms_st: moneySchema,
} satisfies Record<AnticipationCorrectableField, z.ZodTypeAny>;

export const anticipationItemParamsSchema = z
  .object({
    id: z.string().uuid("Lote inválido."),
    item_id: z.string().uuid("Item inválido."),
  })
  .strict();

// null desfaz a classificação, o valor manual ou a correção de um campo.
export const updateAnticipationItemBodySchema = z
  .object({
    classification: z
      .enum(ANTICIPATION_CLASSIFICATIONS, {
        errorMap: () => ({ message: "Classificação inválida." }),
      })
      .nullable()
      .optional(),
    manual_value: moneySchema.nullable().optional(),
    corrections: z
      .object(
        Object.fromEntries(
          ANTICIPATION_CORRECTABLE_FIELDS.map((field) => [
            field,
            correctionValueSchemas[field].nullable().optional(),
          ]),
        ) as {
          [K in AnticipationCorrectableField]: z.ZodOptional<
            z.ZodNullable<(typeof correctionValueSchemas)[K]>
          >;
        },
      )
      .strict()
      .optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.classification !== undefined ||
      value.manual_value !== undefined ||
      Object.keys(value.corrections ?? {}).length > 0,
    { message: "Nada para alterar." },
  );

export const submitAnticipationBatchBodySchema = z
  .object({ reviewer_id: z.string().uuid("Conferente inválido.") })
  .strict();

export const checkAnticipationBatchBodySchema = z
  .object({
    decision: z.enum(["approve", "return"], {
      errorMap: () => ({ message: "Decisão inválida." }),
    }),
    reason: reasonSchema.optional(),
  })
  .strict()
  .refine((value) => value.decision === "approve" || value.reason, {
    message: "Informe o motivo da devolução.",
    path: ["reason"],
  });

export type UpdateAnticipationItemBody = z.infer<typeof updateAnticipationItemBodySchema>;
export type CheckAnticipationBatchBody = z.infer<typeof checkAnticipationBatchBodySchema>;
