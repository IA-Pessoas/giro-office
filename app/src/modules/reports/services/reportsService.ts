import { setupAPIClient } from "@shared/services/api";

import type {
  ReportDefinition,
  ReportComposition,
  ReportCompositionPreview,
  ReportDownloadResult,
  ReportHistoryPage,
  ReportHistoryScope,
  ReportJob,
  ReportModel,
  ReportPreviewPayload,
  ReportPreviewResult,
  ReportSnapshotPage,
  ReportsCatalog,
  SharedReportModel,
} from "../types/report.types";
import {
  buildReportJobListParams,
  fetchReportsCatalog,
  fetchReportsPreview,
  REPORTS_ENDPOINTS,
  unwrapReportDownload,
  unwrapReportJobEnvelope,
  unwrapReportJobListEnvelope,
  unwrapReportsEnvelope,
  unwrapReportCompositionPreview,
} from "./reportsService.contract";

export const reportsService = {
  async previewComposition(definition: ReportComposition): Promise<ReportCompositionPreview> {
    const response = await setupAPIClient().post(REPORTS_ENDPOINTS.preview, { definition });
    return unwrapReportCompositionPreview(response.data);
  },
  async validateDefinition(definition: ReportComposition): Promise<void> {
    const response = await setupAPIClient().post("/reports/definitions/validate", { definition });
    unwrapReportsEnvelope(response.data);
  },
  async createJob(definition: ReportComposition): Promise<ReportJob> {
    const response = await setupAPIClient().post(REPORTS_ENDPOINTS.createJob, { definition });
    return unwrapReportJobEnvelope(response.data);
  },
  async getJob(id: string): Promise<ReportJob> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.job(id));
    return unwrapReportJobEnvelope(response.data);
  },
  async getCatalog(): Promise<ReportsCatalog> {
    const api = setupAPIClient();
    return fetchReportsCatalog((path) => api.get(path));
  },
  async preview(payload: ReportPreviewPayload): Promise<ReportPreviewResult> {
    const api = setupAPIClient();
    return fetchReportsPreview((path, body) => api.post(path, body), payload);
  },

  async listModels(): Promise<ReportModel[]> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.models);
    return unwrapReportsEnvelope<{ items: ReportModel[] }>(response.data).items;
  },

  async listSharedModels(): Promise<SharedReportModel[]> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.sharedModels);
    return unwrapReportsEnvelope<{ items: SharedReportModel[] }>(response.data).items;
  },

  async deleteModel(id: string): Promise<void> {
    await setupAPIClient().delete(REPORTS_ENDPOINTS.model(id));
  },

  async copySharedModel(id: string): Promise<ReportModel> {
    const response = await setupAPIClient().post(REPORTS_ENDPOINTS.copySharedModel(id));
    return unwrapReportsEnvelope<ReportModel>(response.data);
  },

  async updateSharedModel(
    id: string,
    payload: { name?: string; definition: ReportDefinition },
  ): Promise<SharedReportModel> {
    const response = await setupAPIClient().patch(REPORTS_ENDPOINTS.sharedModel(id), payload);
    return unwrapReportsEnvelope<SharedReportModel>(response.data);
  },

  async listJobs(params: Record<string, unknown>): Promise<ReportHistoryPage> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.jobs, {
      params: buildReportJobListParams(params),
    });
    return unwrapReportJobListEnvelope(response.data);
  },

  async cancelJob(id: string): Promise<void> {
    await setupAPIClient().post(REPORTS_ENDPOINTS.cancelJob(id));
  },

  async getSnapshot(
    id: string,
    scope: ReportHistoryScope,
    cursor?: number,
  ): Promise<ReportSnapshotPage> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.snapshot(id), {
      params: buildReportJobListParams({ scope, cursor, limit: 100 }),
    });
    return unwrapReportsEnvelope<ReportSnapshotPage>(response.data);
  },

  async downloadSnapshot(
    id: string,
    format: "pdf" | "csv" | "xlsx",
  ): Promise<ReportDownloadResult> {
    const response = await setupAPIClient().get(REPORTS_ENDPOINTS.download(id), {
      params: { format },
      responseType: "blob",
    });
    const headers = response.headers as unknown as Record<string, string | undefined>;
    return unwrapReportDownload(response.data, headers, `report-${id}.${format}`);
  },
};
