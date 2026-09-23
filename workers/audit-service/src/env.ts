import type { WorkerEnv } from "@workspace/runtime";

export interface AuditWorkerEnv extends WorkerEnv {
  AUDIT_ENABLED: string | boolean;
  INTERNAL_SERVICE_TOKEN: string;
  JWT_SECRET: string;
}

export function auditEnabled(env: AuditWorkerEnv): boolean {
  return env.AUDIT_ENABLED === true || env.AUDIT_ENABLED === "true" || env.AUDIT_ENABLED === "1";
}
