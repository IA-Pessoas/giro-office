export type TiId = string | number;

export type TiStatus =
  | "active"
  | "inactive"
  | "open"
  | "in_progress"
  | "resolved"
  | "closed"
  | "available"
  | "assigned"
  | "returned"
  | "maintenance"
  | "retired"
  | "draft"
  | "signed"
  | string;

export type TiListFilters = Record<string, string | number | boolean | null | undefined>;

export interface TiListResponse<TItem> {
  items: TItem[];
  total?: number;
  page?: number;
  page_size?: number;
  hasMore?: boolean;
  limit?: number;
  [key: string]: unknown;
}

export interface TiMutationMessage {
  message?: string;
  success?: boolean;
  [key: string]: unknown;
}

export type TiEnvelope<TPayload> =
  | TPayload
  | {
      data?: TPayload;
      result?: TPayload;
      payload?: TPayload;
      items?: TPayload extends Array<unknown> ? TPayload : never;
      message?: string;
      [key: string]: unknown;
    };

export interface TiReadQueryOptions {
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}
