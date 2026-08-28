import { setupAPIClient } from "@shared/services/api";

import type { ReportPreviewPayload, ReportPreviewResult, ReportsCatalog } from "../types/report.types";
import { fetchReportsCatalog, fetchReportsPreview } from "./reportsService.contract";

export const reportsService = {
  async getCatalog(): Promise<ReportsCatalog> {
    const api = setupAPIClient();
    return fetchReportsCatalog((path) => api.get(path));
  },
  async preview(payload: ReportPreviewPayload): Promise<ReportPreviewResult> {
    const api = setupAPIClient();
    return fetchReportsPreview((path, body) => api.post(path, body), payload);
  },
};
