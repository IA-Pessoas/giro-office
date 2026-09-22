import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface CommercialWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  INTERNAL_REQUEST_ORIGIN?: string;
  USER_SERVICE?: ServiceBinding;
  USER_SERVICE_INTERNAL_TOKEN?: string;
  CLIENT_SERVICE?: ServiceBinding;
  CLIENT_SERVICE_INTERNAL_TOKEN?: string;
  TASK_SERVICE?: ServiceBinding;
  TASK_SERVICE_INTERNAL_TOKEN?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
  COMMERCIAL_EMAIL_ADAPTER_URL?: string;
  COMMERCIAL_EMAIL_ADAPTER_TOKEN?: string;
  COMMERCIAL_EMAIL_FROM?: string;
}
