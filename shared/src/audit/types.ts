import type { AuthKind, PlatformRole } from "../auth/types.js";

export type AuditOutcome = "success" | "error" | "aborted";
export type AuditQueryValue = string | string[];
export type AuditQuery = Record<string, AuditQueryValue>;
export type AuditReservation = "protected" | "public";
export type AuditRecorder = (
  payload: CreateAuditRequestPayload,
  reservation?: AuditReservation,
) => Promise<void>;
export type ReservableAuditRecorder = AuditRecorder & {
  reserve(kind: AuditReservation): AuditReservation | undefined;
};

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
  /** Auditoria de alterações de entidades (LogService) */
  action?: string | null;
  referring?: string | null;
  referringId?: string | null;
  changes?: Record<string, unknown> | string | null;
  department?: string | null;
}

export interface AuditRequestRecord {
  id: string;
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
  /** Auditoria de alterações de entidades (LogService) */
  action?: string | null;
  referring?: string | null;
  referringId?: string | null;
  changes?: Record<string, unknown> | null;
  department?: string | null;
}

export interface AuditSearchFilters {
  organizationId?: string;
  requestId?: string;
  userId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  dateFrom?: string;
  dateTo?: string;
  /** Filtros para auditoria de alterações de entidades (LogService) */
  referring?: string;
  referringId?: string;
  department?: string;
  page: number;
  pageSize: number;
}

export interface AuditSearchResult {
  items: AuditRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export type OrganizationAuditStatus = "trial" | "past_due" | "active" | "suspended" | "cancelled";
export type OrganizationAuditPlan = "trial" | "pro" | "enterprise";
export type PlatformAuditChange<T extends string> = { from: T | null; to: T | null };

export interface PlatformOrganizationAuditChanges {
  status?: PlatformAuditChange<OrganizationAuditStatus>;
  subscription_plan?: PlatformAuditChange<OrganizationAuditPlan>;
  logo_url?: PlatformAuditChange<string>;
}

export interface PlatformAuditRequestRecord {
  id: string;
  requestId: string;
  organizationId?: string | null;
  method: string;
  path: string;
  statusCode?: number | null;
  outcome: AuditOutcome;
  durationMs?: number | null;
  serviceSource: string;
  createdAt: string;
  action?: string | null;
  referring?: string | null;
  referringId?: string | null;
  actorPlatformUserId?: string;
  changes?: PlatformOrganizationAuditChanges;
}

export interface PlatformAuditSearchResult {
  items: PlatformAuditRequestRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ForwardedAuditAuthContext {
  userId: string;
  organizationId?: string;
  permission?: number;
  authKind?: AuthKind;
  platformRole?: PlatformRole;
}
