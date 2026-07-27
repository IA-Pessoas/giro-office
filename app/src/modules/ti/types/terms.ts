import type { TiId, TiStatus } from "./common";

export interface TiTerm {
  id: TiId;
  title?: string;
  date?: string | null;
  user_name?: string | null;
  user_cpf?: string | null;
  user_id?: TiId | null;
  department_id?: TiId | null;
  address?: string | null;
  reason?: string | null;
  equipament_list?: string | null;
  brand?: string | null;
  asset_code?: string | null;
  imei?: string | null;
  assignee_name?: string | null;
  user?: {
    id?: TiId;
    name?: string | null;
    full_name?: string | null;
    [key: string]: unknown;
  } | null;
  status?: TiStatus;
  signed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiTermPayload {
  date?: string;
  user_id?: TiId | "";
  department_id?: TiId | "";
  address?: string;
  reason?: string;
  equipament_list?: string;
  brand?: string;
  asset_code?: string;
  imei?: string;
}

export type TiTermUpdatePayload = Omit<TiTermPayload, "user_id">;

export interface TiTermSignPayload {
  reason?: string;
}
