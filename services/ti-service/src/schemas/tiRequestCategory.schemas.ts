import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const tiRequestCategoryIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Categoria de TI inválida." }),
  })
  .strict();

export const createTiRequestCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name"),
  })
  .strict();

export const updateTiRequestCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.active !== undefined, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const listTiRequestCategoriesQuerySchema = z
  .object({
    active: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  })
  .strict();

export type CreateTiRequestCategoryBody = z.infer<typeof createTiRequestCategoryBodySchema>;
export type UpdateTiRequestCategoryBody = z.infer<typeof updateTiRequestCategoryBodySchema>;
export type ListTiRequestCategoriesQuery = z.infer<typeof listTiRequestCategoriesQuerySchema>;
