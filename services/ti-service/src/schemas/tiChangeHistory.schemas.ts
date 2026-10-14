import { z } from "zod";

import { paginationQuerySchema } from "./pagination.schemas.js";

/** Tipos de item do histórico; os mesmos de `Historico::ti` no legado que têm destino atual. */
export const TI_CHANGE_HISTORY_ITEM_TYPES = [
  "inventory",
  "inventory_category",
  "term",
  "password",
  "robot",
] as const;

export type TiChangeHistoryItemType = (typeof TI_CHANGE_HISTORY_ITEM_TYPES)[number];

export const listTiChangeHistoryQuerySchema = paginationQuerySchema
  .extend({
    item_type: z.enum(TI_CHANGE_HISTORY_ITEM_TYPES).optional(),
    item_id: z.string().uuid({ message: "Item inválido." }).optional(),
  })
  .strict();

export type ListTiChangeHistoryQuery = z.infer<typeof listTiChangeHistoryQuerySchema>;
