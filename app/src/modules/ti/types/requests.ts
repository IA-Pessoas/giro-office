import type { TiId, TiStatus } from "./common";

export interface TiRequest {
  id: TiId;
  title?: string;
  description?: string | null;
  category_id?: TiId | null;
  requester_id?: TiId | null;
  assigned_to_id?: TiId | null;
  assigned_to_name?: string | null;
  requester_name?: string | null;
  category_name?: string | null;
  urgency?: string | null;
  status?: TiStatus;
  anydesk_code?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiRequestCategory {
  id: TiId;
  name?: string;
  active?: boolean | null;
  description?: string | null;
  status?: TiStatus | boolean;
  [key: string]: unknown;
}

export interface TiRequestMessage {
  id: TiId;
  request_id?: TiId;
  author_id?: TiId | null;
  author_name?: string | null;
  message?: string;
  attachment?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

export interface TiRequestPayload {
  title?: string;
  description?: string | null;
  category_id?: TiId | null;
  urgency?: string | null;
  status?: string | null;
  anydesk_code?: string;
  [key: string]: unknown;
}

export interface TiRequestAssignPayload {
  assigned_to_id?: TiId | null;
  user_id?: TiId | null;
  [key: string]: unknown;
}

export interface TiTransferCandidate {
  id: TiId;
  name?: string | null;
  full_name?: string | null;
  department_id: TiId;
}

export interface TiRequestStatusPayload {
  status: string;
  [key: string]: unknown;
}

export interface TiRequestMessagePayload {
  message: string;
  attachment?: File;
  [key: string]: unknown;
}

export interface TiRequestCategoryPayload {
  name?: string;
  active?: boolean | null;
  description?: string | null;
  status?: string | boolean | null;
  [key: string]: unknown;
}
