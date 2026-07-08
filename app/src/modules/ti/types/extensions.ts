import type { TiId, TiStatus } from "./common";

export interface TiExtensionUser {
  id?: TiId;
  name?: string | null;
  full_name?: string | null;
  department_id?: TiId | null;
  organization_id?: TiId | null;
  [key: string]: unknown;
}

export interface TiExtension {
  id: TiId;
  number?: string;
  name?: string | null;
  user_id?: TiId | null;
  location_id?: TiId | null;
  status?: TiStatus | boolean;
  user?: TiExtensionUser | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiExtensionCreatePayload {
  user_id: TiId;
  number: string;
}

export interface TiExtensionUpdatePayload {
  user_id?: TiId;
  number?: string;
}
