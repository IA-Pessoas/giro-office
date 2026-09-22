import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface ParcelamentoWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
}
