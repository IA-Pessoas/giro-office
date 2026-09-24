import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface UserWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUTH_COOKIE_SECURE?: boolean;
  REPORTS_INTERNAL_TOKEN?: string;
  ADMIN_PASSWORD?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
}
