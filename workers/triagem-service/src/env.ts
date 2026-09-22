import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface TriagemWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  ENABLE_API_DOCS?: string;
  NODE_ENV?: string;
  AUDIT_SERVICE?: ServiceBinding;
  AUDIT_SERVICE_TOKEN?: string;
}
