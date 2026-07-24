import type {
  CreateTaskDependentData,
  CreateTaskModelData,
  TaskDependent,
  TaskModelDetail,
  TaskModelListItem,
  TaskModelListParams,
  UpdateTaskModelData,
} from "../types/taskModel";
import { unwrapServiceEnvelope } from "./envelope.contract.js";
import type { PaginatedResult } from "@shared/pagination/pagination";

export const TASK_MODEL_ENDPOINTS = {
  crud: "/task/model",
  list: "/task/model/list",
  dependent: "/task/model/dependent",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildTaskModelListParams(params: TaskModelListParams = {}) {
  return {
    ...(params.type ? { type: params.type } : {}),
    ...(params.billing ? { billing: params.billing } : {}),
    ...(params.search ? { search: params.search.trim() } : {}),
    ...(params.page !== undefined ? { page: params.page } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
  };
}

export function buildCreateTaskModelPayload(payload: CreateTaskModelData) {
  return {
    name: payload.name,
    department_id: payload.department_id,
    responsible_id: payload.responsible_id,
    responsible2_id: payload.responsible2_id || null,
    responsible3_id: payload.responsible3_id || null,
    observations: payload.observations || null,
    billing: payload.billing,
    prevision: payload.prevision,
    type: payload.type ?? null,
  };
}

export function buildUpdateTaskModelPayload(payload: UpdateTaskModelData) {
  return {
    task_id: payload.id,
    name: payload.name,
    department_id: payload.department_id,
    responsible_id: payload.responsible_id,
    responsible2_id: payload.responsible2_id || null,
    responsible3_id: payload.responsible3_id || null,
    observations: payload.observations || null,
    billing: payload.billing,
    prevision: payload.prevision,
    type: payload.type ?? null,
  };
}

export function buildDeleteTaskModelPayload(taskId: string) {
  return { task_id: taskId };
}

export function buildListDependentsParams(taskModelId: string) {
  return { task_model_id: taskModelId };
}

export function buildDeleteDependentPayload(id: string) {
  return { id };
}

export function unwrapTaskModelList(body: unknown): TaskModelListItem[] {
  return unwrapServiceEnvelope(body) as TaskModelListItem[];
}

export function unwrapTaskModelPage(
  body: unknown,
  fallback: { page: number; limit: number },
): PaginatedResult<TaskModelListItem> {
  const data = unwrapServiceEnvelope(body) as
    | TaskModelListItem[]
    | PaginatedResult<TaskModelListItem>;

  if (Array.isArray(data)) {
    return {
      data,
      total: data.length,
      page: fallback.page,
      limit: fallback.limit,
      hasMore: false,
    };
  }

  return data;
}

export function unwrapTaskModelDetail(body: unknown): TaskModelDetail {
  const data = unwrapServiceEnvelope(body) as { detail?: TaskModelDetail } | TaskModelDetail;

  if (isRecord(data) && "detail" in data) {
    return data.detail as TaskModelDetail;
  }

  return data as TaskModelDetail;
}

export function unwrapCreatedTaskModel(body: unknown): TaskModelDetail {
  const data = unwrapServiceEnvelope(body) as { create?: TaskModelDetail } | TaskModelDetail;

  if (isRecord(data) && "create" in data) {
    return data.create as TaskModelDetail;
  }

  return data as TaskModelDetail;
}

export function unwrapUpdatedTaskModel(body: unknown): TaskModelDetail {
  return unwrapServiceEnvelope(body) as TaskModelDetail;
}

export function unwrapTaskDependentList(body: unknown): TaskDependent[] {
  return unwrapServiceEnvelope(body) as TaskDependent[];
}

export function buildCreateDependentPayload(payload: CreateTaskDependentData) {
  return {
    task_model_id: payload.task_model_id,
    dependent_id: payload.dependent_id,
    wait: payload.wait,
    observation: payload.observation,
  };
}
