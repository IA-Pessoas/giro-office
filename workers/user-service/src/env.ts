import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface UserWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUTH_COOKIE_SECURE?: boolean;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
}
