import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const createCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    active: z.boolean().optional(),
  })
  .strict();

export const updateCategoryBodySchema = z
  .object({
    id: zNonEmptyText("id"),
    name: zNonEmptyText("name").optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.active !== undefined, {
    message: "Informe name ou active para atualizar.",
  });

export const deleteCategoryBodySchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();
