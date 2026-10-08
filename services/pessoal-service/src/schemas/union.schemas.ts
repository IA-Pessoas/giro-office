import { isValidCnpj, zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const unionIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id inválido." }),
  })
  .strict();

export const listUnionsQuerySchema = z
  .object({
    search: z.string().trim().default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createUnionBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    // #1301: a edição só confere o CNPJ quando ele muda (cadastros antigos fora do padrão).
    cnpj: zNonEmptyText("cnpj").refine(isValidCnpj, "CNPJ inválido."),
    base_date: zIsoDate("base_date").nullable().optional(),
  })
  .strict();

export const updateUnionBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    cnpj: zNonEmptyText("cnpj").optional(),
    base_date: zIsoDate("base_date").nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreateUnionBody = z.infer<typeof createUnionBodySchema>;
export type UpdateUnionBody = z.infer<typeof updateUnionBodySchema>;
