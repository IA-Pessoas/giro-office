import type { WorkerEnv } from "@workspace/runtime";

export interface ReportsWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  NODE_ENV?: string;
}
