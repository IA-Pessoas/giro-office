import { setupAPIClient } from "@shared/services/api";

import type { ReportsCatalog } from "../types/report.types";
import { fetchReportsCatalog } from "./reportsService.contract";

export const reportsService = {
  async getCatalog(): Promise<ReportsCatalog> {
    const api = setupAPIClient();
    return fetchReportsCatalog((path) => api.get(path));
  },
};
