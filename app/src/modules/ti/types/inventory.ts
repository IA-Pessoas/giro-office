import type { TiId, TiStatus } from "./common";

export interface TiInventoryAsset {
  id: TiId;
  name?: string;
  description?: string | null;
  code?: string | null;
  patrimony_code?: string | null;
  serial_number?: string | null;
  category_id?: TiId | null;
  category?: TiInventoryCategory | null;
  location_id?: TiId | null;
  location?: TiInventoryLocation | null;
  assigned_user_id?: TiId | null;
  assigned_to_user_id?: TiId | null;
  assigned_user_name?: string | null;
  assigned_to_user_name?: string | null;
  brand?: string | null;
  model?: string | null;
  notes?: string | null;
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
  is_active?: boolean | null;
  [key: string]: unknown;
}

export interface TiInventoryLocation {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  is_active?: boolean | null;
  [key: string]: unknown;
}

export interface TiInventoryPayload {
  name?: string;
  description?: string;
  code?: string;
  patrimony_code?: string;
  serial_number?: string;
  category_id?: TiId | "";
  location_id?: TiId | "";
  brand?: string;
  model?: string;
  notes?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TiInventoryAssignUserPayload {
  assigned_user_id?: TiId | "";
  assigned_to_user_id?: TiId | "";
  notes?: string;
  [key: string]: unknown;
}

export interface TiInventoryReturnPayload {
  notes?: string;
  returned_at?: string;
  [key: string]: unknown;
}

export interface TiInventoryCategoryPayload {
  name?: string;
  description?: string;
  status?: string | boolean;
  is_active?: boolean;
  [key: string]: unknown;
}

export interface TiInventoryLocationPayload {
  name?: string;
  description?: string;
  status?: string | boolean;
  is_active?: boolean;
  [key: string]: unknown;
}
