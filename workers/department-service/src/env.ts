import type { ServiceBinding, WorkerEnv } from "@workspace/runtime";

export interface DepartmentWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE_TOKEN: string;
  AUDIT_SERVICE: ServiceBinding;
}
