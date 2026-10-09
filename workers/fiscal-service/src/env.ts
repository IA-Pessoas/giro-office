import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface FiscalWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  ENABLE_API_DOCS?: string;
  NODE_ENV?: string;
  SERVICE_ALLOWED_ORIGINS?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FISCAL_MALHA_ATTACHMENT_BUCKET?: string;
}
