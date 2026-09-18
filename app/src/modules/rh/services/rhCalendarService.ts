import { setupAPIClient } from "@shared/services/api";

import type {
  ApproveRhTimeBankReleasePayload,
  CreateRhHolidayPayload,
  CreateRhTimeBankReleasePayload,
  CreateRhTimeSheetPayload,
  DeleteRhHolidayPayload,
  RhHoliday,
  RhMutationMessage,
  RhTimeBankOverview,
  RhTimeBankRelease,
  RhTimeBankReleaseListFilters,
  RhTimeBankSummary,
  RhTimeSheetDetail,
  RhTimeSheetListItem,
  RhTimeSheetListFilters,
  RebuildRhTimeSheetPayload,
  ReopenRhTimeSheetPayload,
  SignRhTimeSheetPayload,
  UpdateRhHolidayPayload,
} from "../types";
import {
  buildRhTimeBankReleaseListParams,
  buildRhTimeSheetListParams,
  RH_ENDPOINTS,
  unwrapRhEnvelope,
} from "./rhService.contract";

export const rhCalendarService = {
  async listHolidays(): Promise<RhHoliday[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.holidays);

    return unwrapRhEnvelope<RhHoliday[]>(response.data);
  },

  async createHoliday(payload: CreateRhHolidayPayload): Promise<RhHoliday> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.holidays, payload);

    return unwrapRhEnvelope<RhHoliday>(response.data);
  },

  async updateHoliday(payload: UpdateRhHolidayPayload): Promise<RhHoliday> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.holidays, payload);

    return unwrapRhEnvelope<RhHoliday>(response.data);
  },

  async deleteHoliday(payload: DeleteRhHolidayPayload): Promise<RhMutationMessage> {
    const api = setupAPIClient();
    const response = await api.delete(RH_ENDPOINTS.holidays, { data: payload });

    return unwrapRhEnvelope<RhMutationMessage>(response.data);
  },

  async listTimeBankReleases(
    filters: RhTimeBankReleaseListFilters = {},
  ): Promise<RhTimeBankRelease[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeBankReleaseList, {
      params: buildRhTimeBankReleaseListParams(filters),
    });

    return unwrapRhEnvelope<RhTimeBankRelease[]>(response.data);
  },

  async getMyTimeBankSummary(): Promise<RhTimeBankSummary> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeBankSummary);

    return unwrapRhEnvelope<RhTimeBankSummary>(response.data);
  },

  async getTimeBankSummaryByUserId(userId: string): Promise<RhTimeBankSummary> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeBankSummaryByUser(userId));

    return unwrapRhEnvelope<RhTimeBankSummary>(response.data);
  },

  async getTimeBankOverview(): Promise<RhTimeBankOverview> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeBankOverview);

    return unwrapRhEnvelope<RhTimeBankOverview>(response.data);
  },

  async createTimeBankRelease(
    payload: CreateRhTimeBankReleasePayload,
  ): Promise<RhTimeBankRelease> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.timeBankReleases, payload);

    return unwrapRhEnvelope<RhTimeBankRelease>(response.data);
  },

  async approveTimeBankRelease(
    payload: ApproveRhTimeBankReleasePayload,
  ): Promise<RhTimeBankRelease> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.timeBankReleaseApprove, payload);

    return unwrapRhEnvelope<RhTimeBankRelease>(response.data);
  },

  async listTimeSheets(filters: RhTimeSheetListFilters = {}): Promise<RhTimeSheetListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeSheets, {
      params: buildRhTimeSheetListParams(filters),
    });

    return unwrapRhEnvelope<RhTimeSheetListItem[]>(response.data);
  },

  async getTimeSheetDetail(id: string): Promise<RhTimeSheetDetail> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeSheetDetail(id));

    return unwrapRhEnvelope<RhTimeSheetDetail>(response.data);
  },

  async createTimeSheet(payload: CreateRhTimeSheetPayload): Promise<RhTimeSheetDetail> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.timeSheets, payload);

    return unwrapRhEnvelope<RhTimeSheetDetail>(response.data);
  },

  async rebuildTimeSheet(payload: RebuildRhTimeSheetPayload): Promise<RhTimeSheetDetail> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.rebuildTimeSheet, payload);

    return unwrapRhEnvelope<RhTimeSheetDetail>(response.data);
  },

  async signTimeSheet(payload: SignRhTimeSheetPayload): Promise<RhTimeSheetDetail> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.signTimeSheet, payload);

    return unwrapRhEnvelope<RhTimeSheetDetail>(response.data);
  },

  async reopenTimeSheet(payload: ReopenRhTimeSheetPayload): Promise<RhTimeSheetDetail> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.reopenTimeSheet, payload);

    return unwrapRhEnvelope<RhTimeSheetDetail>(response.data);
  },

  async downloadTimeSheetPdf(id: string): Promise<{ blob: Blob; filename: string }> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeSheetPdf(id), { responseType: "blob" });
    const contentDisposition = String(response.headers["content-disposition"] ?? "");
    const match = /filename="?([^";]+)"?/iu.exec(contentDisposition);
    return {
      blob: response.data as Blob,
      filename: match?.[1] ?? `folha-ponto-${id}.pdf`,
    };
  },
};
