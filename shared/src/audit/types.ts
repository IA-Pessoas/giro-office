export type AuditOutcome = "success" | "error" | "aborted";
export type AuditQueryValue = string | string[];
export type AuditQuery = Record<string, AuditQueryValue>;
export type AuditRecorder = (payload: CreateAuditRequestPayload) => Promise<void>;

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
