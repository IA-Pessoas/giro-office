import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface ContabilWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  TRIAGEM_SERVICE?: ServiceBinding;
  TRIAGEM_INTERNAL_TOKEN?: string;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
}
