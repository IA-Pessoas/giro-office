import type { TiId, TiStatus } from "./common";

export interface TiPassword {
  id: TiId;
  title?: string;
  username?: string | null;
  url?: string | null;
  owner_id?: TiId | null;
  status?: TiStatus | boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type TiPasswordPayload = Record<string, unknown>;
