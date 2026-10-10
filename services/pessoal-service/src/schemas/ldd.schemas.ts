import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

/** PDF LDD/INSS de até 700 KB: em base64, cabe no limite de 1 MB de corpo JSON do gateway. */
export const LDD_PDF_MAX_BYTES = 700 * 1024;
export const LDD_PDF_MAX_BASE64_LENGTH = Math.ceil(LDD_PDF_MAX_BYTES / 3) * 4;

export const lddIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listLddQuerySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }).optional(),
  })
  .strict();

const optionalNonNegativeNumber = (fieldName: string) =>
  z
    .number()
    .nonnegative({ message: `${fieldName} não pode ser negativo.` })
    .nullable()
    .optional();

export const createLddBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    type: zNonEmptyText("type"),
    period: z.string().trim().min(1, "period é obrigatório.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export const updateLddBodySchema = z
  .object({
    type: zNonEmptyText("type").optional(),
    period: z.string().trim().min(1, "period é obrigatório.").nullable().optional(),
    due_date: zIsoDate("due_date").nullable().optional(),
    balance_amount: optionalNonNegativeNumber("balance_amount"),
    registration_status: z.string().trim().min(1).nullable().optional(),
    status: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const previewLddImportBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    file_name: z.string().trim().min(1, "file_name é obrigatório.").max(255),
    content_base64: z
      .string()
      .min(1, "content_base64 é obrigatório.")
      .max(LDD_PDF_MAX_BASE64_LENGTH, "O PDF excede o limite de 700 KB.")
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "content_base64 inválido."),
  })
  .strict();

const isCalendarDate = (value: string) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

export const LDD_IMPORT_MAX_ROWS = 500;

export const confirmLddImportBodySchema = z
  .object({
    client_id: z.string().uuid({ message: "client_id inválido." }),
    file_name: z.string().trim().min(1, "file_name é obrigatório.").max(255),
    file_hash: z.string().regex(/^[0-9a-f]{64}$/, "file_hash inválido."),
    rows: z
      .array(
        z
          .object({
            // 13 é a competência do 13º.
            period: z
              .string()
              .regex(/^(0[1-9]|1[0-3])\/\d{4}$/, "period deve estar no formato MM/AAAA."),
            due_date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/, "due_date deve estar no formato AAAA-MM-DD.")
              .refine(isCalendarDate, "due_date inválido."),
            balance_amount: z
              .number()
              .finite()
              .positive("balance_amount deve ser maior que zero.")
              .max(999_999_999.99, "balance_amount acima do permitido."),
          })
          .strict(),
      )
      .min(1, "Informe ao menos uma linha.")
      .max(LDD_IMPORT_MAX_ROWS, `Importe no máximo ${LDD_IMPORT_MAX_ROWS} linhas por PDF.`),
  })
  .strict();

export type ConfirmLddImportBody = z.infer<typeof confirmLddImportBodySchema>;
export type PreviewLddImportBody = z.infer<typeof previewLddImportBodySchema>;
export type CreateLddBody = z.infer<typeof createLddBodySchema>;
export type UpdateLddBody = z.infer<typeof updateLddBodySchema>;
export type ListLddQuery = z.infer<typeof listLddQuerySchema>;
