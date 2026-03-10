export const REQUEST_ID_HEADER = "x-request-id";
export const FORWARDED_AUTH_USER_ID_HEADER = "x-auth-user-id";
export const FORWARDED_AUTH_ORGANIZATION_ID_HEADER = "x-auth-organization-id";
export const FORWARDED_AUTH_PERMISSION_HEADER = "x-auth-permission";
export const INTERNAL_SERVICE_TOKEN_HEADER = "x-internal-service-token";

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;
export const AUDIT_ADMIN_PERMISSION = 2;

export type AuditOutcome = "success" | "error" | "aborted";
export type AuditQueryValue = string | string[];
export type AuditQuery = Record<string, AuditQueryValue>;

export interface CreateAuditRequestPayload {
  requestId: string;
  organizationId?: string | null;
  userId?: string | null;
  permission?: number | null;
  method: string;
  path: string;
  query?: AuditQuery;
  statusCode?: number | null;
  outcome: AuditOutcome;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  serviceSource: string;
  createdAt: string;
  finishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditRequestRecord {
  id: string;
  requestId: string;
  organizationId?: string | null;
  userId?: string | null;
  permission?: number | null;
  method: string;
  path: string;
  query: AuditQuery;
  statusCode?: number | null;
  outcome: AuditOutcome;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  origin?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  serviceSource: string;
  createdAt: string;
  finishedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditSearchFilters {
  organizationId: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface AuditSearchResult {
  items: AuditRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ForwardedAuditAuthContext {
  userId: string;
  organizationId: string;
  permission?: number;
}
