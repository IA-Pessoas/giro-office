import { setupAPIClient } from "@shared/services/api";

import type {
  ApproveRhPointAdjustmentPayload,
  CreateRhPointAdjustmentPayload,
  RhPointAdjustmentRequest,
  RhPointCalculationResult,
  RhPointConfig,
  RhRegisterPointResult,
  UpsertRhPointConfigPayload,
} from "../types";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "./rhService.contract";

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
};
