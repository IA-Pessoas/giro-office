import type { TiId } from "./common";

export interface TiDashboardSummary {
  id?: TiId;
  inventory_total?: number;
  requests_open?: number;
  requests_in_progress?: number;
  requests_closed?: number;
  stock_low_count?: number;
  robots_active?: number;
  updated_at?: string | null;
  [key: string]: unknown;
}
