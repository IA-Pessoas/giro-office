import type { WorkerEnv } from "@workspace/runtime";

export interface RegularizeWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  REGULARIZE_REPORTING_TOKEN?: string;
  REGULARIZE_REPORTING_GRANT_SECRET?: string;
  MTK_ENCRYPTION_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  REGULARIZE_LICENSE_PROTOCOL_BUCKET?: string;
  /** Compatibilidade temporária com a nomenclatura inicial do Worker. */
  LICENSE_PROTOCOL_BUCKET?: string;
}
