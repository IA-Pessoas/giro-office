import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface ClientWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE_TOKEN?: string;
  AUDIT_SERVICE?: ServiceBinding;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
  CNPJ_SERVICE?: ServiceBinding;
  CNPJ_SERVICE_URL?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  CLIENT_HISTORY_BUCKET?: string;
}
