import { setupAPIClient } from "@shared/services/api";

import type {
  ApproveRhTimeBankReleasePayload,
  CreateRhHolidayPayload,
  CreateRhTimeBankReleasePayload,
  CreateRhTimeSheetPayload,
  DeleteRhHolidayPayload,
  RhHoliday,
  RhMutationMessage,
  RhTimeBankRelease,
  RhTimeBankReleaseListFilters,
  RhTimeSheet,
  RhTimeSheetListFilters,
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
    const response = await api.get(RH_ENDPOINTS.timeBankReleases, {
      params: buildRhTimeBankReleaseListParams(filters),
    });

    return unwrapRhEnvelope<RhTimeBankRelease[]>(response.data);
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

  async listTimeSheets(filters: RhTimeSheetListFilters = {}): Promise<RhTimeSheet[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.timeSheets, {
      params: buildRhTimeSheetListParams(filters),
    });

    return unwrapRhEnvelope<RhTimeSheet[]>(response.data);
  },

  async createTimeSheet(payload: CreateRhTimeSheetPayload): Promise<RhTimeSheet> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.timeSheets, payload);

    return unwrapRhEnvelope<RhTimeSheet>(response.data);
  },

  async signTimeSheet(payload: SignRhTimeSheetPayload): Promise<RhTimeSheet> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.signTimeSheet, payload);

    return unwrapRhEnvelope<RhTimeSheet>(response.data);
  },
};
