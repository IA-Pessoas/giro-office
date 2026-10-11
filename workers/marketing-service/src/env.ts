import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface MarketingWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  MTK_ENCRYPTION_KEY?: string;
  AUDIT_ENABLED?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
}
