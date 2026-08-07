import { setupAPIClient } from "@shared/services/api";

import type {
  ApproveRhPointAdjustmentPayload,
  RhPointAdjustmentListFilters,
  CreateRhPointAdjustmentPayload,
  RhPointAdjustmentRequest,
  RhPointCalculationResult,
  RhPointConfig,
  RhPointListFilters,
  RhPointListItem,
  RhPointMonthlySummary,
  RhRegisterPointResult,
  RhTodayPoint,
  UpsertRhPointConfigPayload,
  RejectRhPointAdjustmentPayload,
} from "../types";
import {
  buildRhPointAdjustmentListParams,
  buildRhPointListParams,
  buildRhPointSummaryParams,
  RH_ENDPOINTS,
  unwrapRhEnvelope,
} from "./rhService.contract";

export const rhPointService = {
  async getMyPointConfig(): Promise<RhPointConfig | null> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.pointConfig);

    return unwrapRhEnvelope<RhPointConfig | null>(response.data);
  },

  async getPointConfigByUserId(userId: string): Promise<RhPointConfig | null> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.pointConfigByUser(userId));

    return unwrapRhEnvelope<RhPointConfig | null>(response.data);
  },

  async upsertPointConfig(payload: UpsertRhPointConfigPayload): Promise<RhPointConfig> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.pointConfig, payload);

    return unwrapRhEnvelope<RhPointConfig>(response.data);
  },

  async listPoints(filters: RhPointListFilters = {}): Promise<RhPointListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.points, {
      params: buildRhPointListParams(filters),
    });

    return unwrapRhEnvelope<RhPointListItem[]>(response.data);
  },

  async getTodayPoint(): Promise<RhTodayPoint> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.myTodayPoint);

    return unwrapRhEnvelope<RhTodayPoint>(response.data);
  },

  async getMonthlySummary(
    filters: { month: string; user_id?: string },
  ): Promise<RhPointMonthlySummary> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.pointSummary, {
      params: buildRhPointSummaryParams(filters),
    });

    return unwrapRhEnvelope<RhPointMonthlySummary>(response.data);
  },

  async listAdjustmentRequests(
    filters: RhPointAdjustmentListFilters = {},
  ): Promise<RhPointAdjustmentRequest[]> {
    const api = setupAPIClient();
    const response = await api.get(RH_ENDPOINTS.pointAdjustmentRequests, {
      params: buildRhPointAdjustmentListParams(filters),
    });

    return unwrapRhEnvelope<RhPointAdjustmentRequest[]>(response.data);
  },

  async registerPoint(): Promise<RhRegisterPointResult> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.registerPoint);

    return unwrapRhEnvelope<RhRegisterPointResult>(response.data);
  },

  async calculatePoint(pointId: string): Promise<RhPointCalculationResult> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.calculatePoint(pointId));

    return unwrapRhEnvelope<RhPointCalculationResult>(response.data);
  },

  async requestAdjustment(
    payload: CreateRhPointAdjustmentPayload,
  ): Promise<RhPointAdjustmentRequest> {
    const api = setupAPIClient();
    const response = await api.post(RH_ENDPOINTS.requestPointAdjustment, payload);

    return unwrapRhEnvelope<RhPointAdjustmentRequest>(response.data);
  },

  async approveAdjustment(
    payload: ApproveRhPointAdjustmentPayload,
  ): Promise<RhPointAdjustmentRequest> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.approvePointAdjustment, payload);

    return unwrapRhEnvelope<RhPointAdjustmentRequest>(response.data);
  },

  async rejectAdjustment(
    payload: RejectRhPointAdjustmentPayload,
  ): Promise<RhPointAdjustmentRequest> {
    const api = setupAPIClient();
    const response = await api.put(RH_ENDPOINTS.rejectPointAdjustment, payload);

    return unwrapRhEnvelope<RhPointAdjustmentRequest>(response.data);
  },
};
