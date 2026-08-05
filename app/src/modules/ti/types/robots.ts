import type { TiId, TiStatus } from "./common";

export type TiRobotType = "Backup" | "Relatorio" | "Integracao" | "Manutencao" | "Monitoramento";

export interface TiRobot {
  id: TiId;
  name?: string;
  title?: string | null;
  description?: string | null;
  type?: TiRobotType | string;
  status?: TiStatus | boolean;
  active?: boolean;
  schedule?: string | null;
  last_status?: TiStatus | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiRobotRun {
  id: TiId;
  robot_id?: TiId;
  status?: TiStatus;
  triggered_by_id?: TiId | null;
  triggered_by_name?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  message?: string | null;
  metadata_json?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface TiRobotPayload {
  name: string;
  description?: string | null;
  type: TiRobotType | string;
  status?: string;
  active?: boolean;
  schedule?: string | null;
  [key: string]: unknown;
}

export interface TiRobotRunPayload {
  status?: string;
  message?: string;
  metadata_json?: Record<string, unknown>;
  finished_at?: string | null;
  [key: string]: unknown;
}
