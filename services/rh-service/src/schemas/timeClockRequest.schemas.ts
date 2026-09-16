import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

const organizationDate = z
  .string({
    required_error: "date e obrigatorio.",
    invalid_type_error: "date deve ser uma string.",
  })
  .trim()
  .min(1, "date e obrigatorio.")
  .refine((value) => {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }
    return !Number.isNaN(new Date(value).getTime());
  }, "date invalida.");

const pointTimesShape = {
  clock_in: zIsoDate("clock_in"),
  lunch_out: zIsoDate("lunch_out"),
  lunch_in: zIsoDate("lunch_in"),
  clock_out: zIsoDate("clock_out"),
};

const optionalAttachment = z
  .string()
  .trim()
  .max(500, "attachment excede o limite permitido.")
  .optional();

export const createAdjustmentRequestBodySchema = z
  .object({
    point_id: z.string().uuid({ message: "point_id invalido." }).optional(),
    date: organizationDate.optional(),
    ...pointTimesShape,
    justification: zNonEmptyText("justification"),
    attachment: optionalAttachment,
  })
  .strict();

export const createRetroactiveAdjustmentBodySchema = z
  .object({
    target_user_id: z.string().uuid({ message: "target_user_id invalido." }),
    date: organizationDate,
    ...pointTimesShape,
    justification: zNonEmptyText("justification"),
  })
  .strict();

export const approveAdjustmentBodySchema = z
  .object({
    request_id: zNonEmptyText("request_id"),
    obs_approver: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v): string | null | undefined => {
        if (v === undefined) {
          return undefined;
        }
        if (v === null) {
          return null;
        }
        return String(v);
      }),
  })
  .strict();

export const rejectAdjustmentBodySchema = approveAdjustmentBodySchema;

export const approveAdjustmentsBulkBodySchema = z
  .object({
    request_ids: z
      .array(z.string().uuid({ message: "request_id invalido." }))
      .min(1, "Informe ao menos uma solicitacao.")
      .max(100, "O lote pode conter no maximo 100 solicitacoes."),
    obs_approver: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v): string | null | undefined => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        return String(v);
      }),
  })
  .strict();

export const listAdjustmentRequestsQuerySchema = z
  .object({
    status: z
      .enum(["Pendente", "Aprovado", "Rejeitado"], {
        message: "status deve ser Pendente, Aprovado ou Rejeitado.",
      })
      .optional(),
    user_id: z.string().uuid({ message: "user_id inválido." }).optional(),
  })
  .strict();

export const uploadAdjustmentAttachmentParamsSchema = z
  .object({
    requestId: z.string().uuid({ message: "requestId invalido." }),
  })
  .strict();
