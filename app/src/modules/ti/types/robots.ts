import type { TiId, TiStatus } from "./common";

export interface TiRobot {
  id: TiId;
  name?: string;
  title?: string | null;
  description?: string | null;
  status?: TiStatus | boolean;
  owner_id?: TiId | null;
  owner_name?: string | null;
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
  output?: string | null;
  error_message?: string | null;
  [key: string]: unknown;
}

export interface TiRobotPayload {
  name?: string;
  description?: string | null;
  status?: string;
  owner_id?: TiId | null;
  schedule?: string | null;
  [key: string]: unknown;
}

export interface TiRobotRunPayload {
  status?: string;
  output?: string | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  [key: string]: unknown;
}
