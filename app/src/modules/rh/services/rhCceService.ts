import { setupAPIClient } from "@shared/services/api";

import type {
  CceCycle,
  CceFloorConfiguration,
  CreateCceCyclePayload,
  UpdateCceWeeklyEvaluationPayload,
  CceWeeklyEvaluation,
} from "../types";
import { RH_ENDPOINTS, unwrapRhEnvelope } from "./rhService.contract";

export const rhCceService = {
  async getFloors(): Promise<CceFloorConfiguration> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.cceFloors);
    return unwrapRhEnvelope<CceFloorConfiguration>(response.data);
  },

  async configureFloors(floor_count: number): Promise<CceFloorConfiguration> {
    const response = await setupAPIClient().put(RH_ENDPOINTS.cceFloors, { floor_count });
    return unwrapRhEnvelope<CceFloorConfiguration>(response.data);
  },

  async listCycles(): Promise<CceCycle[]> {
    const response = await setupAPIClient().get(RH_ENDPOINTS.cceCycles);
    return unwrapRhEnvelope<CceCycle[]>(response.data);
  },

  async createCycle(payload: CreateCceCyclePayload): Promise<CceCycle> {
    const response = await setupAPIClient().post(RH_ENDPOINTS.cceCycles, payload);
    return unwrapRhEnvelope<CceCycle>(response.data);
  },

  async updateWeek(payload: UpdateCceWeeklyEvaluationPayload): Promise<CceWeeklyEvaluation> {
    const { id, ...body } = payload;
    const response = await setupAPIClient().patch(RH_ENDPOINTS.cceWeek(id), body);
    return unwrapRhEnvelope<CceWeeklyEvaluation>(response.data);
  },
};
