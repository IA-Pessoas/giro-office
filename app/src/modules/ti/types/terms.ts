import type { TiId, TiStatus } from "./common";

export interface TiTerm {
  id: TiId;
  title?: string;
  description?: string | null;
  inventory_id?: TiId | null;
  asset_id?: TiId | null;
  inventory?: {
    id?: TiId;
    name?: string | null;
    code?: string | null;
    patrimony_code?: string | null;
    [key: string]: unknown;
  } | null;
  user_id?: TiId | null;
  user_name?: string | null;
  assignee_name?: string | null;
  status?: TiStatus;
  signed_at?: string | null;
  content?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiTermPayload {
  title?: string;
  description?: string;
  inventory_id?: TiId | "";
  asset_id?: TiId | "";
  user_id?: TiId | "";
  user_name?: string;
  content?: string;
  notes?: string;
  status?: string;
  [key: string]: unknown;
}

export interface TiTermSignPayload {
  signer_name?: string;
  signed_at?: string;
  notes?: string;
  [key: string]: unknown;
}
