import { api } from "@shared/services/apiClient";

import type {
  TiEnvelope,
  TiId,
  TiListFilters,
  TiRobot,
  TiRobotPayload,
  TiRobotRun,
  TiRobotRunPayload,
} from "../types";
import {
  buildTiListParams,
  buildTiPath,
  TI_ENDPOINTS,
  unwrapTiEnvelope,
  unwrapTiList,
} from "./tiService.contract";

export const tiRobotsService = {
  async list(filters?: TiListFilters): Promise<TiRobot[]> {
    const response = await api.get(TI_ENDPOINTS.robots.list, {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiRobot>(response.data);
  },

  async create(payload: TiRobotPayload): Promise<TiRobot> {
    const response = await api.post<TiEnvelope<TiRobot>>(TI_ENDPOINTS.robots.base, payload);

    return unwrapTiEnvelope<TiRobot>(response.data);
  },

  async getById(id: TiId): Promise<TiRobot> {
    const response = await api.get<TiEnvelope<TiRobot>>(
      buildTiPath(TI_ENDPOINTS.robots.detail, id),
    );

    return unwrapTiEnvelope<TiRobot>(response.data);
  },

  async update(id: TiId, payload: TiRobotPayload): Promise<TiRobot> {
    const response = await api.patch<TiEnvelope<TiRobot>>(
      buildTiPath(TI_ENDPOINTS.robots.detail, id),
      payload,
    );

    return unwrapTiEnvelope<TiRobot>(response.data);
  },

  async createRun(id: TiId, payload: TiRobotRunPayload): Promise<TiRobotRun> {
    const response = await api.post<TiEnvelope<TiRobotRun>>(
      buildTiPath(TI_ENDPOINTS.robots.runs, id),
      payload,
    );

    return unwrapTiEnvelope<TiRobotRun>(response.data);
  },

  async listRuns(id: TiId, filters?: TiListFilters): Promise<TiRobotRun[]> {
    const response = await api.get(buildTiPath(TI_ENDPOINTS.robots.runsList, id), {
      params: buildTiListParams(filters),
    });

    return unwrapTiList<TiRobotRun>(response.data);
  },
};
