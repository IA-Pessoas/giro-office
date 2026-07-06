import type { TiId, TiStatus } from "./common";

export interface TiStockItem {
  id: TiId;
  name?: string;
  sku?: string | null;
  category_id?: TiId | null;
  location_id?: TiId | null;
  quantity?: number;
  minimum_quantity?: number | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiStockCategory {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiStockLocation {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export type TiStockItemPayload = Record<string, unknown>;
export type TiStockMovementPayload = Record<string, unknown>;
export type TiStockCategoryPayload = Record<string, unknown>;
export type TiStockLocationPayload = Record<string, unknown>;
