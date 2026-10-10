import { isValidCnpj, normalizeCpfCnpj } from "@workspace/shared";
import { TAX_REGIME_OPTIONS } from "@workspace/shared/regularize";
import { z } from "zod";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido; use AAAA-MM.");
export const contingencyQuerySchema = z
  .object({
    client_id: z.string().uuid("Cliente inválido."),
    company_name: z.string().trim().min(1, "Informe a empresa.").max(200),
    cnpj: z.string().max(18).transform(normalizeCpfCnpj).refine(isValidCnpj, "CNPJ inválido."),
    period_start: month,
    period_end: month,
    regime: z.enum(TAX_REGIME_OPTIONS),
    annex: z.enum(["", "I", "II", "III", "IV", "V"]).default(""),
    rate: z
      .union([z.number(), z.string().trim().min(1)])
      .pipe(z.coerce.number().min(0).max(100).multipleOf(0.01))
      .default(11),
    filename: z
      .string()
      .min(1)
      .max(180)
      .regex(/^[^/\\\p{Cc}]+\.xls$/iu, "Envie um arquivo .xls."),
  })
  .strict()
  .refine((data) => data.period_start <= data.period_end, {
    message: "O início do período deve ser anterior ou igual ao fim.",
    path: ["period_end"],
  })
  .refine((data) => data.regime === "Simples Nacional" || data.annex === "", {
    message: "Anexo só se aplica ao Simples Nacional.",
    path: ["annex"],
  });

export type ContingencyInput = z.infer<typeof contingencyQuerySchema>;
