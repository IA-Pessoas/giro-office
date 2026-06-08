import type {
  CreateTaskDependentData,
  CreateTaskModelData,
  TaskDependent,
  TaskModelDetail,
  TaskModelListItem,
  TaskModelListParams,
  UpdateTaskModelData,
} from "../types/taskModel";
import { unwrapProjectEnvelope } from "./projectService.contract.ts";

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
  return unwrapProjectEnvelope<TaskModelListItem[]>(body);
}

export function unwrapTaskModelDetail(body: unknown): TaskModelDetail {
  const data = unwrapProjectEnvelope<{ detail?: TaskModelDetail } | TaskModelDetail>(body);

  if (isRecord(data) && "detail" in data) {
    return data.detail as TaskModelDetail;
  }

  return data as TaskModelDetail;
}

export function unwrapCreatedTaskModel(body: unknown): TaskModelDetail {
  const data = unwrapProjectEnvelope<{ create?: TaskModelDetail } | TaskModelDetail>(body);

  if (isRecord(data) && "create" in data) {
    return data.create as TaskModelDetail;
  }

  return data as TaskModelDetail;
}

export function unwrapUpdatedTaskModel(body: unknown): TaskModelDetail {
  return unwrapProjectEnvelope<TaskModelDetail>(body);
}

export function unwrapTaskDependentList(body: unknown): TaskDependent[] {
  return unwrapProjectEnvelope<TaskDependent[]>(body);
}

export function buildCreateDependentPayload(payload: CreateTaskDependentData) {
  return {
    task_model_id: payload.task_model_id,
    dependent_id: payload.dependent_id,
    wait: payload.wait,
    observation: payload.observation,
  };
}
