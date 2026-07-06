import type { TiId, TiStatus } from "./common";

export interface TiInventoryAsset {
  id: TiId;
  name?: string;
  code?: string | null;
  serial_number?: string | null;
  category_id?: TiId | null;
  location_id?: TiId | null;
  assigned_user_id?: TiId | null;
  status?: TiStatus;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiInventoryCategory {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiInventoryLocation {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export type TiInventoryPayload = Record<string, unknown>;
export type TiInventoryAssignUserPayload = Record<string, unknown>;
export type TiInventoryReturnPayload = Record<string, unknown>;
export type TiInventoryCategoryPayload = Record<string, unknown>;
export type TiInventoryLocationPayload = Record<string, unknown>;
