import { setupAPIClient } from "@shared/services/api";
import type { PaginatedResult } from "@shared/pagination/pagination";

import type {
  CreateTaskDependentData,
  CreateTaskModelData,
  TaskDependent,
  TaskModelDetail,
  TaskModelListItem,
  TaskModelListParams,
  TaskModelOptions,
  UpdateTaskModelData,
} from "../types/taskModel";
import {
  buildCreateDependentPayload,
  buildCreateTaskModelPayload,
  buildDeleteDependentPayload,
  buildDeleteTaskModelPayload,
  buildListDependentsParams,
  buildTaskModelListParams,
  buildUpdateTaskModelPayload,
  TASK_MODEL_ENDPOINTS,
  unwrapCreatedTaskModel,
  unwrapTaskDependentList,
  unwrapTaskModelDetail,
  unwrapTaskModelList,
  unwrapTaskModelOptions,
  unwrapTaskModelPage,
  unwrapUpdatedTaskModel,
} from "./taskModelService.contract";

export const taskModelService = {
  async list(params: TaskModelListParams = {}): Promise<TaskModelListItem[]> {
    const api = setupAPIClient();
    const response = await api.get(TASK_MODEL_ENDPOINTS.list, {
      params: buildTaskModelListParams(params),
    });

    return unwrapTaskModelList(response.data);
  },

  async listOptions(): Promise<TaskModelOptions> {
    const api = setupAPIClient();
    const response = await api.get(TASK_MODEL_ENDPOINTS.options);

    return unwrapTaskModelOptions(response.data);
  },

  async listPage(
    params: TaskModelListParams & { page: number; limit: number },
  ): Promise<PaginatedResult<TaskModelListItem>> {
    const api = setupAPIClient();
    const response = await api.get(TASK_MODEL_ENDPOINTS.list, {
      params: buildTaskModelListParams(params),
    });

    return unwrapTaskModelPage(response.data, params);
  },

  async detail(taskId: string): Promise<TaskModelDetail> {
    const api = setupAPIClient();
    const response = await api.get(TASK_MODEL_ENDPOINTS.crud, {
      params: { task_id: taskId },
    });

    return unwrapTaskModelDetail(response.data);
  },

  async create(payload: CreateTaskModelData): Promise<TaskModelDetail> {
    const api = setupAPIClient();
    const response = await api.post(
      TASK_MODEL_ENDPOINTS.crud,
      buildCreateTaskModelPayload(payload),
    );

    return unwrapCreatedTaskModel(response.data);
  },

  async update(payload: UpdateTaskModelData): Promise<TaskModelDetail> {
    const api = setupAPIClient();
    const response = await api.put(
      TASK_MODEL_ENDPOINTS.crud,
      buildUpdateTaskModelPayload(payload),
    );

    return unwrapUpdatedTaskModel(response.data);
  },

  async delete(taskId: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(TASK_MODEL_ENDPOINTS.crud, {
      data: buildDeleteTaskModelPayload(taskId),
    });
  },

  async listDependents(taskModelId: string): Promise<TaskDependent[]> {
    const api = setupAPIClient();
    const response = await api.get(TASK_MODEL_ENDPOINTS.dependent, {
      params: buildListDependentsParams(taskModelId),
    });

    return unwrapTaskDependentList(response.data);
  },

  async addDependent(payload: CreateTaskDependentData): Promise<void> {
    const api = setupAPIClient();
    await api.post(TASK_MODEL_ENDPOINTS.dependent, buildCreateDependentPayload(payload));
  },

  async deleteDependent(id: string): Promise<void> {
    const api = setupAPIClient();
    await api.delete(TASK_MODEL_ENDPOINTS.dependent, {
      data: buildDeleteDependentPayload(id),
    });
  },
};
