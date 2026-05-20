import { zIsoDate, zNonEmptyText } from "@workspace/shared";
import { z } from "zod";

export const stockItemIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Item de estoque invalido." }),
  })
  .strict();

export const stockCategoryIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Categoria de estoque invalida." }),
  })
  .strict();

export const stockLocationIdParamsSchema = z
  .object({
    id: z.string().uuid({ message: "Local de estoque invalido." }),
  })
  .strict();

export const createTiStockItemBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    category_id: z.string().uuid({ message: "Categoria de estoque invalida." }),
    location_id: z.string().uuid({ message: "Local de estoque invalido." }),
    quantity: z.coerce.number().int().min(0),
    description: z.string().optional(),
  })
  .strict();

export const updateTiStockItemBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    category_id: z.string().uuid({ message: "Categoria de estoque invalida." }).optional(),
    location_id: z.string().uuid({ message: "Local de estoque invalido." }).optional(),
    description: z.string().optional(),
    status: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const createTiStockEntryBodySchema = z
  .object({
    quantity: z.coerce.number().int().positive(),
    entry_date: zIsoDate("entry_date").optional(),
  })
  .strict();

export const createTiStockExitBodySchema = z
  .object({
    quantity: z.coerce.number().int().positive(),
    destination: z.string().optional(),
    requester_id: z.string().uuid({ message: "Solicitante invalido." }),
    approver_id: z.string().uuid({ message: "Aprovador invalido." }).optional(),
    operator_id: z.string().uuid({ message: "Operador invalido." }).optional(),
    location_destination_id: z.string().uuid({ message: "Local destino invalido." }).optional(),
    exit_date: zIsoDate("exit_date").optional(),
  })
  .strict();

export const createTiStockCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name"),
  })
  .strict();

export const updateTiStockCategoryBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    status: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const createTiStockLocationBodySchema = z
  .object({
    name: zNonEmptyText("name"),
    floor: z.coerce.number().int().optional(),
  })
  .strict();

export const updateTiStockLocationBodySchema = z
  .object({
    name: zNonEmptyText("name").optional(),
    floor: z.coerce.number().int().nullable().optional(),
    status: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export const listTiStockItemsQuerySchema = z
  .object({
    category_id: z.string().uuid({ message: "Categoria de estoque invalida." }).optional(),
    location_id: z.string().uuid({ message: "Local de estoque invalido." }).optional(),
    name: z.string().optional(),
    status: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
  })
  .strict();

export type CreateTiStockItemBody = z.infer<typeof createTiStockItemBodySchema>;
export type UpdateTiStockItemBody = z.infer<typeof updateTiStockItemBodySchema>;
export type CreateTiStockEntryBody = z.infer<typeof createTiStockEntryBodySchema>;
export type CreateTiStockExitBody = z.infer<typeof createTiStockExitBodySchema>;
export type CreateTiStockCategoryBody = z.infer<typeof createTiStockCategoryBodySchema>;
export type UpdateTiStockCategoryBody = z.infer<typeof updateTiStockCategoryBodySchema>;
export type CreateTiStockLocationBody = z.infer<typeof createTiStockLocationBodySchema>;
export type UpdateTiStockLocationBody = z.infer<typeof updateTiStockLocationBodySchema>;
export type ListTiStockItemsQuery = z.infer<typeof listTiStockItemsQuerySchema>;
