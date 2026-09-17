import type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskCompletionDecision,
  IntegracaoTaskCompletionRequest,
  IntegracaoTaskAttachment,
  IntegracaoTaskPostponement,
  IntegracaoTaskDetail,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  UpdateIntegracaoTaskBody,
} from "../types/integracaoTask";
import { unwrapServiceEnvelope } from "./envelope.contract.js";

export const INTEGRACAO_TASKS_ENDPOINTS = {
  crud: "/task",
  list: "/task/list",
  completionRequest: "/task/complete-request",
  completionRequestList: "/task/complete-request/list",
  postponement: "/task/postponement",
  postponementList: "/task/postponement/list",
  reopen: "/task/reopen",
  attachment: "/task/attachment",
  attachmentList: "/task/attachment/list",
  attachmentAccess: "/task/attachment/access",
} as const;

export function buildTaskCompletionRequestPayload(taskId: string, reason: string) {
  return { task_id: taskId, reason };
}

export function buildTaskCompletionDecisionPayload(
  taskId: string,
  requestId: string,
  decision: IntegracaoTaskCompletionDecision,
  reason?: string,
) {
  return {
    task_id: taskId,
    request_id: requestId,
    decision,
    ...(reason ? { reason } : {}),
  };
}

export function buildTaskReopenPayload(taskId: string, reason: string) {
  return { task_id: taskId, reason };
}

export function buildTaskPostponementPayload(
  taskId: string,
  newPrevisionDate: string,
  justification: string,
) {
  return {
    task_id: taskId,
    new_prevision_date: newPrevisionDate,
    justification,
  };
}

export function buildIntegracaoTaskListParams(params: IntegracaoTaskListParams) {
  return {
    status: params.status ?? "Todos",
    ref: params.ref ?? "",
    ref_id: params.ref_id ?? "",
    search: params.search ?? "",
    ...(params.clientId !== undefined ? { client_id: params.clientId } : {}),
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

export function unwrapTaskCompletionRequestHistory(body: unknown): IntegracaoTaskCompletionRequest[] {
  return unwrapServiceEnvelope(body) as IntegracaoTaskCompletionRequest[];
}

export function unwrapTaskPostponementHistory(body: unknown): IntegracaoTaskPostponement[] {
  return unwrapServiceEnvelope(body) as IntegracaoTaskPostponement[];
}

export function unwrapTaskAttachmentList(body: unknown): IntegracaoTaskAttachment[] {
  return unwrapServiceEnvelope(body) as IntegracaoTaskAttachment[];
}

export function unwrapTaskAttachmentAccessUrl(body: unknown): string {
  const value = unwrapServiceEnvelope(body) as { url?: unknown };
  if (typeof value?.url !== "string") throw new Error("Resposta de acesso ao anexo inválida.");
  return value.url;
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
