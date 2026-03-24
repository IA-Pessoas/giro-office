import { ServiceError } from "@workspace/shared";
import { z } from "zod";

function throwFirstZodIssue(error: z.ZodError): never {
  const first = error.issues[0];
  throw new ServiceError(400, first?.message ?? "Requisição inválida.");
}

export function parseWithZod<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throwFirstZodIssue(result.error);
  }
  return result.data;
}

const zNonEmptyText = (field: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().min(1, { message: `${field} é obrigatório.` }));

const zIsoDate = (field: string) =>
  z
    .unknown()
    .superRefine((val, ctx) => {
      if (val === undefined || val === null || val === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} é obrigatório.` });
        return;
      }
      const data = new Date(String(val));
      if (Number.isNaN(data.getTime())) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field} inválido.` });
      }
    })
    .transform((val): Date => new Date(String(val)));

export const createAdjustmentRequestBodySchema = z.object({
  point_id: zNonEmptyText("point_id"),
  clock_in: zIsoDate("clock_in"),
  lunch_out: zIsoDate("lunch_out"),
  lunch_in: z.unknown().optional(),
  launch_in: z.unknown().optional(),
  clock_out: zIsoDate("clock_out"),
  justification: zNonEmptyText("justification"),
  attachment: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v): string | undefined => {
      if (v === undefined || v === null) {
        return undefined;
      }
      return String(v);
    }),
});

export const approveAdjustmentBodySchema = z.object({
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
});
