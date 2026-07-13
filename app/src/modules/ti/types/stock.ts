import type { TiId, TiStatus } from "./common";

export interface TiStockItem {
  id: TiId;
  name?: string;
  sku?: string | null;
  category_id?: TiId | null;
  location_id?: TiId | null;
  description?: string | null;
  quantity?: number;
  minimum_quantity?: number | null;
  status?: TiStatus | boolean;
  category?: TiStockCategory | null;
  location?: TiStockLocation | null;
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
  floor?: number | null;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiStockItemCreatePayload {
  name: string;
  category_id: TiId;
  location_id: TiId;
  quantity: number;
  description?: string;
}

export interface TiStockItemUpdatePayload {
  name?: string;
  category_id?: TiId;
  location_id?: TiId;
  description?: string;
  status?: boolean;
}

export interface TiStockEntryPayload {
  quantity: number;
  entry_date?: string;
}

export interface TiStockExitPayload {
  quantity: number;
  requester_id: TiId;
  destination?: string;
  approver_id?: TiId;
  operator_id?: TiId;
  location_destination_id?: TiId;
  exit_date?: string;
}

export interface TiStockCategoryCreatePayload {
  name: string;
}

export interface TiStockCategoryUpdatePayload {
  name?: string;
  status?: boolean;
}

export interface TiStockLocationCreatePayload {
  name: string;
  floor?: number;
}

export interface TiStockLocationUpdatePayload {
  name?: string;
  floor?: number | null;
  status?: boolean;
}
