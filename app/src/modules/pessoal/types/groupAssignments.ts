import type { PaginatedResult } from "@shared/pagination/pagination";

export interface PessoalGroupAssignmentEligible {
  client_id: string;
  client_name: string;
  payroll_id: string;
  group_id: string | null;
  group_name: string | null;
}

export interface PessoalGroupAssignmentPreviewDetail {
  client_id: string;
  client_name: string | null;
  payroll_id: string | null;
  previous_group_id: string | null;
  previous_group_name: string | null;
  outcome: "CHANGED" | "NO_OP" | "SKIPPED";
  skip_reason: string | null;
}

export interface PessoalGroupAssignmentPreview {
  preview_id: string;
  fingerprint: string;
  version: number;
  expires_at: string;
  ttl_seconds: number;
  applied_at: string | null;
  target_group: { id: string; name: string };
  totals: { changed: number; no_op: number; skipped: number; requested: number };
  details: PaginatedResult<PessoalGroupAssignmentPreviewDetail>;
}

export interface PessoalGroupAssignmentApplyResult {
  preview_id: string;
  changed: number;
  no_op: number;
  skipped: number;
  idempotent: boolean;
}

export interface PessoalGroupAssignmentEligibleParams {
  page: number;
  limit: number;
  search?: string;
}
