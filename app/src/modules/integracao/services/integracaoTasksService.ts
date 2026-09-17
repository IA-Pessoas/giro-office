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
  buildTaskCompletionDecisionPayload,
  buildTaskCompletionRequestPayload,
  buildTaskReopenPayload,
  buildUpdateIntegracaoTaskPayload,
  INTEGRACAO_TASKS_ENDPOINTS,
  unwrapCreatedIntegracaoTask,
  unwrapIntegracaoTaskDetail,
  unwrapIntegracaoTaskList,
  unwrapTaskCompletionRequestHistory,
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

  async requestCompletion(taskId: string, reason: string): Promise<void> {
    const api = setupAPIClient();
    await api.post(
      INTEGRACAO_TASKS_ENDPOINTS.completionRequest,
      buildTaskCompletionRequestPayload(taskId, reason),
    );
  },

  async decideCompletion(
    taskId: string,
    requestId: string,
    decision: "approved" | "refused",
    reason?: string,
  ): Promise<void> {
    const api = setupAPIClient();
    await api.put(
      INTEGRACAO_TASKS_ENDPOINTS.completionRequest,
      buildTaskCompletionDecisionPayload(taskId, requestId, decision, reason),
    );
  },

  async cancelCompletion(taskId: string, requestId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(INTEGRACAO_TASKS_ENDPOINTS.completionRequest, {
      data: { task_id: taskId, request_id: requestId },
    });
  },

  async listCompletionRequests(taskId: string) {
    const api = setupAPIClient();
    const response = await api.get(INTEGRACAO_TASKS_ENDPOINTS.completionRequestList, {
      params: { task_id: taskId },
    });
    return unwrapTaskCompletionRequestHistory(response.data);
  },

  async reopen(taskId: string, reason: string): Promise<void> {
    const api = setupAPIClient();
    await api.put(INTEGRACAO_TASKS_ENDPOINTS.reopen, buildTaskReopenPayload(taskId, reason));
  },
};
