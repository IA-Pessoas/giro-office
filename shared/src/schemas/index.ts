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

export const zNonEmptyText = (field: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().min(1, { message: `${field} é obrigatório.` }));

export const zIsoDate = (field: string) =>
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
