import type { TiId, TiStatus } from "./common";

export interface TiTerm {
  id: TiId;
  title?: string;
  inventory_id?: TiId | null;
  user_id?: TiId | null;
  status?: TiStatus;
  signed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type TiTermPayload = Record<string, unknown>;
export type TiTermSignPayload = Record<string, unknown>;
