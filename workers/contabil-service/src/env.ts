import type { WorkerEnv } from "@workspace/runtime";

export interface ContabilWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  AUDIT_SERVICE?: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
}
