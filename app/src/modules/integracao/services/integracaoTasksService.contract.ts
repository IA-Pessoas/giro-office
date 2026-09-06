import type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskDetail,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  UpdateIntegracaoTaskBody,
} from "../types/integracaoTask";
import { unwrapServiceEnvelope } from "./envelope.contract.js";

export const INTEGRACAO_TASKS_ENDPOINTS = {
  crud: "/task",
  list: "/task/list",
} as const;

export function buildIntegracaoTaskListParams(params: IntegracaoTaskListParams) {
  return {
    status: params.status ?? "Todos",
    ref: params.ref ?? "",
    ref_id: params.ref_id ?? "",
    search: params.search ?? "",
    ...(params.clientId ? { client_id: params.clientId } : {}),
    ...(params.assignment ? { assignment: params.assignment } : {}),
    page: params.page ?? 1,
    limit: params.limit ?? 20,
  };
}

export function buildCreateIntegracaoTaskPayload(payload: CreateIntegracaoTaskBody) {
  return {
    model_id: payload.model_id,
    project_id: payload.project_id,
    client_id: payload.client_id,
    prospecting_status: payload.prospecting_status,
    ...(payload.name ? { name: payload.name } : {}),
    ...(payload.status ? { status: payload.status } : {}),
    department_id: payload.department_id,
    observations: payload.observations ?? "",
    ...(payload.billing ? { billing: payload.billing } : {}),
    urgency: payload.urgency,
    ...(payload.responsible_id !== undefined && payload.responsible_id !== "" ? { responsible_id: payload.responsible_id } : {}),
    ...(payload.responsible2_id !== undefined && payload.responsible2_id !== "" ? { responsible2_id: payload.responsible2_id } : {}),
    ...(payload.responsible3_id !== undefined && payload.responsible3_id !== "" ? { responsible3_id: payload.responsible3_id } : {}),
    ...(payload.prevision_date ? { prevision_date: payload.prevision_date } : {}),
  };
}

export function buildUpdateIntegracaoTaskPayload(payload: UpdateIntegracaoTaskBody) {
  return payload.responsible_id === "" ? { ...payload, responsible_id: null } : payload;
}

export function buildDeleteIntegracaoTaskPayload(taskId: string) {
  return { task_id: taskId };
}

export function unwrapIntegracaoTaskList(body: unknown): IntegracaoTaskListResult {
  return unwrapServiceEnvelope(body) as IntegracaoTaskListResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapIntegracaoTaskDetail(body: unknown): IntegracaoTaskDetail {
  const data = unwrapServiceEnvelope(body) as
    | { detail?: IntegracaoTaskDetail }
    | IntegracaoTaskDetail;

  if (isRecord(data) && "detail" in data) {
    return data.detail as IntegracaoTaskDetail;
  }

  return data as IntegracaoTaskDetail;
}

export function unwrapCreatedIntegracaoTask(body: unknown): IntegracaoTaskDetail {
  const data = unwrapServiceEnvelope(body) as
    | { create?: IntegracaoTaskDetail }
    | IntegracaoTaskDetail;

  if (isRecord(data) && "create" in data) {
    return data.create as IntegracaoTaskDetail;
  }

  return data as IntegracaoTaskDetail;
}

export function unwrapUpdatedIntegracaoTask(body: unknown): IntegracaoTaskDetail {
  return unwrapServiceEnvelope(body) as IntegracaoTaskDetail;
}
