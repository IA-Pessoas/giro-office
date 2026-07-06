import type { TiId, TiStatus } from "./common";

export interface TiRequest {
  id: TiId;
  title?: string;
  description?: string | null;
  category_id?: TiId | null;
  requester_id?: TiId | null;
  assigned_to_id?: TiId | null;
  priority?: string | null;
  status?: TiStatus;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiRequestCategory {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiRequestMessage {
  id: TiId;
  request_id?: TiId;
  author_id?: TiId | null;
  message?: string;
  created_at?: string;
  [key: string]: unknown;
}

export type TiRequestPayload = Record<string, unknown>;
export type TiRequestAssignPayload = Record<string, unknown>;
export type TiRequestStatusPayload = Record<string, unknown>;
export type TiRequestMessagePayload = Record<string, unknown>;
export type TiRequestCategoryPayload = Record<string, unknown>;
