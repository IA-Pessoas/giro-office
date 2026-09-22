import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface TaskWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  /** Valida a identidade repassada pelo gateway e autentica as chamadas ao project-service. */
  INTERNAL_SERVICE_TOKEN: string;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  PROJECT_SERVICE?: ServiceBinding;
  /** Mesmo valor de `TASK_SERVICE_INTERNAL_TOKEN` no commercial Worker. */
  COMMERCIAL_SERVICE_TOKEN?: string;
  REPORTS_INTERNAL_TOKEN?: string;
  REPORTS_GRANT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TASK_ATTACHMENT_STORAGE_BUCKET?: string;
  AI_EXTRACTION_MODE?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  AI_EXTRACTION_TIMEOUT_MS?: string;
  AI_EXTRACTION_RATE_LIMIT_MAX?: string;
  AI_EXTRACTION_RATE_LIMIT_WINDOW_MS?: string;
}
