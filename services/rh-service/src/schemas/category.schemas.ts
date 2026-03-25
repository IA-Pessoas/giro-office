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
    name: zNonEmptyText("name"),
    active: z.boolean(),
  })
  .strict();

export const deleteCategoryBodySchema = z
  .object({
    id: zNonEmptyText("id"),
  })
  .strict();
