import type { WorkerEnv } from "@workspace/runtime";

export interface RhWorkerEnv extends WorkerEnv {
  JWT_SECRET: string;
  INTERNAL_SERVICE_TOKEN: string;
  /** Anexos de ajuste de ponto e de mensagens RH (Supabase Storage). Sem eles: 503. */
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  RH_POINT_ADJUSTMENT_BUCKET?: string;
  RH_REQUEST_MESSAGE_BUCKET?: string;
  /** Intervalo mínimo entre batidas de ponto; padrão 30, como no Node. */
  POINT_MIN_INTERVAL_MINUTES?: string;
}
