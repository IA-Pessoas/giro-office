import type { TiId, TiStatus } from "./common";

export interface TiExtension {
  id: TiId;
  number?: string;
  name?: string | null;
  user_id?: TiId | null;
  location_id?: TiId | null;
  status?: TiStatus | boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export type TiExtensionPayload = Record<string, unknown>;
