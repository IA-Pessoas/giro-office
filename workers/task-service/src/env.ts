import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface TaskWorkerEnv extends WorkerEnv {
  NODE_ENV?: string;
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_ENABLED?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  /** Token que o commercial envia em `/internal/commercial/*` (TASK_SERVICE_INTERNAL_TOKEN lá). */
  COMMERCIAL_SERVICE_TOKEN?: string;
  PROJECT_SERVICE?: ServiceBinding;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
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
  ENABLE_API_DOCS?: string;
}
