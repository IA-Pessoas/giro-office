import type { TiId, TiStatus } from "./common";

export interface TiPasswordUser {
  id?: TiId;
  name?: string | null;
  full_name?: string | null;
  department_id?: TiId | null;
  organization_id?: TiId | null;
  [key: string]: unknown;
}

export interface TiPasswordListItem {
  id: TiId;
  local?: string | null;
  user_id?: TiId | null;
  notes?: string | null;
  status?: TiStatus | boolean;
  user?: TiPasswordUser | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiPasswordDetail extends TiPasswordListItem {
  password?: string | null;
}

export type TiPassword = TiPasswordListItem;

export interface TiPasswordCreatePayload {
  local: string;
  user_id: TiId;
  password: string;
  notes?: string;
}

export interface TiPasswordUpdatePayload {
  local?: string;
  user_id?: TiId;
  password?: string;
  notes?: string;
}
