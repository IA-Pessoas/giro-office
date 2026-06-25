import { zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const tiInventoryLocationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Local de inventario invalido." }),
  })
  .strict();

export const createTiInventoryLocationBodySchema = z
  .object({
    name: zNonEmptyText("name"),
  })
  .strict();

export const updateTiInventoryLocationBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export type CreateTiInventoryLocationBody = z.infer<typeof createTiInventoryLocationBodySchema>;
export type UpdateTiInventoryLocationBody = z.infer<typeof updateTiInventoryLocationBodySchema>;
