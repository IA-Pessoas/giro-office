import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const unionIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "id invalido." }),
  })
  .strict();

export const createUnionBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    cnpj: zNonEmptyText("cnpj"),
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
