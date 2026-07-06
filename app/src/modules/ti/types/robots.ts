import type { TiId, TiStatus } from "./common";

export interface TiRobot {
  id: TiId;
  name?: string;
  description?: string | null;
  status?: TiStatus | boolean;
  owner_id?: TiId | null;
  last_run_at?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface TiRobotRun {
  id: TiId;
  robot_id?: TiId;
  status?: TiStatus;
  started_at?: string | null;
  finished_at?: string | null;
  output?: string | null;
  [key: string]: unknown;
}

export type TiRobotPayload = Record<string, unknown>;
export type TiRobotRunPayload = Record<string, unknown>;
