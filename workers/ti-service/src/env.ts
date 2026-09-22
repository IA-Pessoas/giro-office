import type { WorkerEnv } from "@workspace/runtime";

export interface TiWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
}
