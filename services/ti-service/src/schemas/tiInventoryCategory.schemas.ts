import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const tiInventoryCategoryIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Categoria de inventario invalida." }),
  })
  .strict();

export const createTiInventoryCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    tag: z.string().optional(),
  })
  .strict();

export const updateTiInventoryCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    tag: z.string().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreateTiInventoryCategoryBody = z.infer<typeof createTiInventoryCategoryBodySchema>;
export type UpdateTiInventoryCategoryBody = z.infer<typeof updateTiInventoryCategoryBodySchema>;
