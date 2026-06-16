import { setupAPIClient } from "@shared/services/api";

import type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskDetail,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  UpdateIntegracaoTaskBody,
} from "../types/integracaoTask";
import {
  buildCreateIntegracaoTaskPayload,
  buildDeleteIntegracaoTaskPayload,
  buildIntegracaoTaskListParams,
  buildUpdateIntegracaoTaskPayload,
  INTEGRACAO_TASKS_ENDPOINTS,
  unwrapCreatedIntegracaoTask,
  unwrapIntegracaoTaskDetail,
  unwrapIntegracaoTaskList,
  unwrapUpdatedIntegracaoTask,
} from "./integracaoTasksService.contract";

export const integracaoTasksService = {
  async list(params: IntegracaoTaskListParams = {}): Promise<IntegracaoTaskListResult> {
    const api = setupAPIClient();
    const response = await api.get(INTEGRACAO_TASKS_ENDPOINTS.list, {
      params: buildIntegracaoTaskListParams(params),
    });

    return unwrapIntegracaoTaskList(response.data);
  },

  async detail(taskId: string): Promise<IntegracaoTaskDetail> {
    const api = setupAPIClient();
    const response = await api.get(INTEGRACAO_TASKS_ENDPOINTS.crud, {
      params: { task_id: taskId },
    });

    return unwrapIntegracaoTaskDetail(response.data);
  },

  async create(payload: CreateIntegracaoTaskBody): Promise<IntegracaoTaskDetail> {
    const api = setupAPIClient();
    const response = await api.post(
      INTEGRACAO_TASKS_ENDPOINTS.crud,
      buildCreateIntegracaoTaskPayload(payload),
    );

    return unwrapCreatedIntegracaoTask(response.data);
  },

  async update(payload: UpdateIntegracaoTaskBody): Promise<IntegracaoTaskDetail> {
    const api = setupAPIClient();
    const response = await api.put(
      INTEGRACAO_TASKS_ENDPOINTS.crud,
      buildUpdateIntegracaoTaskPayload(payload),
    );

    return unwrapUpdatedIntegracaoTask(response.data);
  },

  async delete(taskId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(INTEGRACAO_TASKS_ENDPOINTS.crud, {
      data: buildDeleteIntegracaoTaskPayload(taskId),
    });
  },
};
