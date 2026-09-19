import { unwrapServiceEnvelope } from "./envelope.contract.js";

export const PROJECT_PLAN_ENDPOINTS = {
  crud: "/task/project-plan",
  list: "/task/project-plan/list",
  task: "/task/project-plan/task",
  taskList: "/task/project-plan/task/list",
  hire: "/task/project-plan/hire",
} as const;

export interface ProjectPlan {
  id: string;
  name: string;
  color: string;
}

export interface ProjectPlanTask {
  id: string;
  plan_id: string;
  task_id: string;
  order: number;
  tasks: {
    id: string;
    name: string;
    department_id: string;
    billing: string;
    prevision: number;
    type: string;
  };
}

export interface ProjectPlanDetail extends ProjectPlan {
  tasks: ProjectPlanTask[];
}

export interface ProjectPlanHireResult {
  created: Array<{ id: string }>;
  idempotent: boolean;
}

export function getProjectPlanHireErrorMessage(error: unknown): string {
  const response = (
    error as { response?: { data?: { error?: unknown; message?: unknown } } }
  ).response;
  const message = response?.data?.error ?? response?.data?.message;
  return typeof message === "string" && message.trim()
    ? message
    : "Não foi possível contratar o plano.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildCreateProjectPlanPayload(payload: Pick<ProjectPlan, "name" | "color">) {
  return payload;
}

export function buildUpdateProjectPlanPayload(payload: ProjectPlan) {
  return payload;
}

export function buildHireProjectPlanPayload(payload: { plan_id: string; project_id: string }) {
  return payload;
}

export function unwrapProjectPlanList(body: unknown): ProjectPlan[] {
  return unwrapServiceEnvelope(body) as ProjectPlan[];
}

export function unwrapProjectPlanDetail(body: unknown): ProjectPlanDetail {
  const data = unwrapServiceEnvelope(body) as { detail?: ProjectPlanDetail } | ProjectPlanDetail;
  return isRecord(data) && "detail" in data
    ? (data.detail as ProjectPlanDetail)
    : (data as ProjectPlanDetail);
}

export function unwrapProjectPlanCreated(body: unknown): ProjectPlan {
  const data = unwrapServiceEnvelope(body) as { create?: ProjectPlan } | ProjectPlan;
  return isRecord(data) && "create" in data ? (data.create as ProjectPlan) : (data as ProjectPlan);
}

export function unwrapProjectPlanTask(body: unknown): ProjectPlanTask {
  const data = unwrapServiceEnvelope(body) as { create?: ProjectPlanTask } | ProjectPlanTask;
  return isRecord(data) && "create" in data
    ? (data.create as ProjectPlanTask)
    : (data as ProjectPlanTask);
}

export function unwrapProjectPlanUpdated(body: unknown): ProjectPlan {
  return unwrapServiceEnvelope(body) as ProjectPlan;
}

export function unwrapProjectPlanTasks(body: unknown): ProjectPlanTask[] {
  return unwrapServiceEnvelope(body) as ProjectPlanTask[];
}

export function unwrapProjectPlanHire(body: unknown): ProjectPlanHireResult {
  return unwrapServiceEnvelope(body) as ProjectPlanHireResult;
}
