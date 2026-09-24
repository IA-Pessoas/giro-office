// Oráculo: o app Express do task-service Node. Cada caso vai aos dois apps com os mesmos
// serviços mockados, e status, body e argumentos passados ao serviço têm de ser iguais.
import "@workspace/task-service/src/test/envBootstrap.js";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  COMMERCIAL_PROSPECTING_EVENT_VERSION,
  COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
  COMMERCIAL_TASK_BILLING_EVENT_VERSION,
  COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import { MemoryLogStream } from "@workspace/shared/testUtils";
import { createTaskApp } from "@workspace/task-service/src/app.js";
import { getTaskServiceEnv } from "@workspace/task-service/src/config/env.js";
import * as commercialProspectingClose from "@workspace/task-service/src/services/commercialProspectingCloseService.js";
import * as commercialTaskBilling from "@workspace/task-service/src/services/commercialTaskBillingProjectionService.js";
import * as depsTasks from "@workspace/task-service/src/services/depsTasksService.js";
import * as projectPlan from "@workspace/task-service/src/services/projectPlanService.js";
import * as projectWizardExtraction from "@workspace/task-service/src/services/projectWizardExtractionService.js";
import * as projectWizard from "@workspace/task-service/src/services/projectWizardService.js";
import * as taskAttachment from "@workspace/task-service/src/services/taskAttachmentService.js";
import * as taskCrud from "@workspace/task-service/src/services/taskCrudService.js";
import * as taskDependent from "@workspace/task-service/src/services/taskDependentService.js";
import * as taskFinanceiro from "@workspace/task-service/src/services/taskFinanceiroService.js";
import * as taskIntegrationRegularize from "@workspace/task-service/src/services/taskIntegrationRegularizeService.js";
import * as taskLifecycle from "@workspace/task-service/src/services/taskLifecycleService.js";
import * as taskModel from "@workspace/task-service/src/services/taskModelService.js";
import * as taskOperationalNotification from "@workspace/task-service/src/services/taskOperationalNotificationService.js";
import * as taskPostponement from "@workspace/task-service/src/services/taskPostponementService.js";
import * as taskReporting from "@workspace/task-service/src/services/taskReportingService.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskWorkerApp } from "./app.js";
import type { TaskWorkerEnv } from "./env.js";

vi.mock("@workspace/task-service/src/services/commercialProspectingCloseService.js");
vi.mock("@workspace/task-service/src/services/commercialTaskBillingProjectionService.js");
vi.mock("@workspace/task-service/src/services/depsTasksService.js");
vi.mock("@workspace/task-service/src/services/projectPlanService.js");
vi.mock("@workspace/task-service/src/services/projectWizardExtractionService.js");
vi.mock("@workspace/task-service/src/services/projectWizardService.js");
vi.mock("@workspace/task-service/src/services/taskAttachmentService.js");
vi.mock("@workspace/task-service/src/services/taskCrudService.js");
vi.mock("@workspace/task-service/src/services/taskDependentService.js");
vi.mock("@workspace/task-service/src/services/taskFinanceiroService.js");
vi.mock("@workspace/task-service/src/services/taskIntegrationRegularizeService.js");
vi.mock("@workspace/task-service/src/services/taskLifecycleService.js");
vi.mock("@workspace/task-service/src/services/taskModelService.js");
vi.mock("@workspace/task-service/src/services/taskOperationalNotificationService.js");
vi.mock("@workspace/task-service/src/services/taskPostponementService.js");
vi.mock("@workspace/task-service/src/services/taskReportingService.js");

const SERVICE_CLASSES = {
  CommercialProspectingCloseService: commercialProspectingClose.CommercialProspectingCloseService,
  CommercialTaskBillingProjectionService:
    commercialTaskBilling.CommercialTaskBillingProjectionService,
  DepsTasksService: depsTasks.DepsTasksService,
  ProjectPlanService: projectPlan.ProjectPlanService,
  ProjectWizardExtractionService: projectWizardExtraction.ProjectWizardExtractionService,
  ProjectWizardService: projectWizard.ProjectWizardService,
  TaskAttachmentService: taskAttachment.TaskAttachmentService,
  TaskCrudService: taskCrud.TaskCrudService,
  TaskDependentService: taskDependent.TaskDependentService,
  TaskFinanceiroService: taskFinanceiro.TaskFinanceiroService,
  TaskIntegrationRegularizeService: taskIntegrationRegularize.TaskIntegrationRegularizeService,
  TaskLifecycleService: taskLifecycle.TaskLifecycleService,
  TaskModelService: taskModel.TaskModelService,
  TaskOperationalNotificationService:
    taskOperationalNotification.TaskOperationalNotificationService,
  TaskPostponementService: taskPostponement.TaskPostponementService,
  TaskReportingService: taskReporting.TaskReportingService,
} as Record<string, { prototype: Record<string, unknown> }>;

const nodeEnv = getTaskServiceEnv();
const ORG = "0c6f0b4e-6c1f-4a9b-9d7e-1f0f0f0f0f01";
const UUID = "5b1f6c7a-2d3e-4f50-8a9b-0c1d2e3f4a5b";
const REQUEST_ID = "req-parity-1";

function signJwt(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  return `${body}.${createHmac("sha256", nodeEnv.jwtSecret).update(body).digest("base64url")}`;
}

const owner = signJwt({
  user_id: "user-1",
  organization_id: ORG,
  type: "owner",
  permission: 3,
  modules: { integracao: 3, financeiro: 3 },
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const workerEnv: TaskWorkerEnv = {
  JWT_SECRET: nodeEnv.jwtSecret,
  INTERNAL_SERVICE_TOKEN: "internal-token",
  COMMERCIAL_SERVICE_TOKEN: nodeEnv.commercialServiceToken,
  REPORTS_INTERNAL_TOKEN: nodeEnv.reportsInternalToken,
  REPORTS_GRANT_SECRET: nodeEnv.reportsGrantSecret,
  AI_EXTRACTION_MODE: "fake",
  AUDIT_ENABLED: "false",
};

type Case = {
  name: string;
  method: string;
  path: string;
  auth?: "owner" | "none";
  json?: unknown;
  form?: () => FormData;
  headers?: Record<string, string>;
  /** Mensagem diferente por padrão dos Workers: compara só o status. */
  statusOnly?: boolean;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function grantHeaders(input: {
  operation: "catalog" | "extract";
  source: string;
  fields: string[];
  body: unknown;
}): Record<string, string> {
  const now = Math.floor(Date.now() / 1000);
  const grant = Buffer.from(
    canonicalJson({
      version: 1,
      audience: "task-service",
      operation: input.operation,
      source: input.source,
      organization_id: ORG,
      fields: input.fields,
      request_id: REQUEST_ID,
      issued_at: now,
      expires_at: now + 30,
      body_sha256: createHash("sha256").update(canonicalJson(input.body)).digest("hex"),
    }),
  ).toString("base64url");
  return {
    "x-internal-service-token": nodeEnv.reportsInternalToken,
    "x-reports-grant": grant,
    "x-reports-grant-signature": createHmac("sha256", nodeEnv.reportsGrantSecret)
      .update(grant)
      .digest("hex"),
  };
}

const extractBody = { source: "integracao.tasks", fields: ["id", "status"], limit: 10 };
const pdf = () => new Blob(["%PDF-1.4\n%fake\n"], { type: "application/pdf" });
const form = (entries: Array<[string, string | [Blob, string]]>) => () => {
  const data = new FormData();
  for (const [name, value] of entries) {
    if (typeof value === "string") data.append(name, value);
    else data.append(name, value[0], value[1]);
  }
  return data;
};
const wizardProject = { name: "Projeto", start_date: "2026-01-01", objective: "Objetivo" };
const taskCreate = {
  model_id: "model-1",
  project_id: "project-1",
  client_id: "client-1",
  prospecting_status: "Fechado",
  department_id: "department-1",
  urgency: "Normal",
};
const modelBody = {
  name: "Modelo",
  department_id: "department-1",
  responsible_id: "user-2",
  billing: "Realizar",
  prevision: "3",
};

const CASES: Case[] = [
  { name: "health", method: "GET", path: "/health", auth: "none" },
  { name: "ready", method: "GET", path: "/ready", auth: "none" },
  // CRUD
  { name: "crud create", method: "POST", path: "/task", json: taskCreate },
  { name: "crud create inválido", method: "POST", path: "/task", json: {} },
  {
    name: "crud create sem auth",
    method: "POST",
    path: "/task",
    json: taskCreate,
    auth: "none",
    statusOnly: true,
  },
  { name: "crud list", method: "GET", path: "/task/list?status=Todos&page=2&limit=5" },
  { name: "crud list inválido", method: "GET", path: "/task/list?page=0" },
  { name: "crud update", method: "PUT", path: "/task", json: { task_id: "t-1", name: "novo" } },
  { name: "crud update inválido", method: "PUT", path: "/task", json: { name: "x" } },
  { name: "crud detail query", method: "GET", path: "/task?task_id=t-1" },
  { name: "crud detail sem id", method: "GET", path: "/task" },
  { name: "crud delete query", method: "DELETE", path: "/task?task_id=t-1" },
  { name: "crud delete body", method: "DELETE", path: "/task", json: { task_id: "t-2" } },
  { name: "crud delete sem id", method: "DELETE", path: "/task" },
  // Modelos
  { name: "model create", method: "POST", path: "/task/model", json: modelBody },
  { name: "model create inválido", method: "POST", path: "/task/model", json: { name: "x" } },
  { name: "model detail", method: "GET", path: "/task/model?task_id=m-1" },
  { name: "model detail sem id", method: "GET", path: "/task/model" },
  {
    name: "model update",
    method: "PUT",
    path: "/task/model",
    json: { ...modelBody, task_id: "m-1" },
  },
  { name: "model update inválido", method: "PUT", path: "/task/model", json: modelBody },
  { name: "model list", method: "GET", path: "/task/model/list" },
  { name: "model list paginada", method: "GET", path: "/task/model/list?page=1&limit=10" },
  { name: "model delete", method: "DELETE", path: "/task/model?task_id=m-1" },
  { name: "model delete sem id", method: "DELETE", path: "/task/model" },
  // Dependentes
  {
    name: "dependent create",
    method: "POST",
    path: "/task/model/dependent",
    json: { task_model_id: "m-1", dependent_id: "m-2", wait: 1, observation: 7 },
  },
  { name: "dependent create inválido", method: "POST", path: "/task/model/dependent", json: {} },
  { name: "dependent list", method: "GET", path: "/task/model/dependent?task_model_id=m-1" },
  { name: "dependent list sem id", method: "GET", path: "/task/model/dependent" },
  { name: "dependent delete", method: "DELETE", path: "/task/model/dependent?id=d-1" },
  { name: "dependent delete sem id", method: "DELETE", path: "/task/model/dependent" },
  // Integração regularize
  {
    name: "integration create",
    method: "POST",
    path: "/task/integration",
    json: { task_model_id: "m-1", referring: "r-1", referring_type: "license" },
  },
  {
    name: "integration create inválido",
    method: "POST",
    path: "/task/integration",
    json: { referring_type: "x" },
  },
  {
    name: "integration delete",
    method: "DELETE",
    path: "/task/integration",
    json: { integration_id: "i-1" },
  },
  { name: "integration delete inválido", method: "DELETE", path: "/task/integration", json: {} },
  { name: "integration list", method: "GET", path: "/task/integration?task_model_id=m-1" },
  { name: "integration list inválido", method: "GET", path: "/task/integration?extra=1" },
  // Ciclo de vida
  {
    name: "conclusion",
    method: "PUT",
    path: "/task/conclusion",
    json: { task_id: "t-1", status: "Concluída", responsible_id: "user-2" },
  },
  {
    name: "conclusion inválido",
    method: "PUT",
    path: "/task/conclusion",
    json: { task_id: "t-1" },
  },
  {
    name: "complete-request create",
    method: "POST",
    path: "/task/complete-request",
    json: { task_id: "t-1", reason: "ok" },
  },
  {
    name: "complete-request create inválido",
    method: "POST",
    path: "/task/complete-request",
    json: {},
  },
  {
    name: "complete-request approve",
    method: "PUT",
    path: "/task/complete-request",
    json: { task_id: "t-1", request_id: "r-1", decision: "refused", reason: "não" },
  },
  {
    name: "complete-request approve sem motivo",
    method: "PUT",
    path: "/task/complete-request",
    json: { task_id: "t-1", decision: "refused" },
  },
  {
    name: "complete-request cancel",
    method: "DELETE",
    path: "/task/complete-request",
    json: { task_id: "t-1" },
  },
  {
    name: "complete-request cancel inválido",
    method: "DELETE",
    path: "/task/complete-request",
    json: {},
  },
  { name: "complete-request list", method: "GET", path: "/task/complete-request/list?task_id=t-1" },
  { name: "complete-request list inválido", method: "GET", path: "/task/complete-request/list" },
  {
    name: "reopen",
    method: "PUT",
    path: "/task/reopen",
    json: { task_id: "t-1", reason: "voltar" },
  },
  { name: "reopen inválido", method: "PUT", path: "/task/reopen", json: { task_id: "t-1" } },
  // Adiamento e notificações
  {
    name: "postponement create",
    method: "POST",
    path: "/task/postponement",
    json: { task_id: "t-1", new_prevision_date: "2026-10-01", justification: "atraso" },
  },
  {
    name: "postponement create inválido",
    method: "POST",
    path: "/task/postponement",
    json: { task_id: "t-1", new_prevision_date: "2026-02-30", justification: "x" },
  },
  { name: "postponement list", method: "GET", path: "/task/postponement/list?task_id=t-1" },
  { name: "postponement list inválido", method: "GET", path: "/task/postponement/list" },
  { name: "notifications", method: "GET", path: "/task/notifications" },
  {
    name: "notifications read",
    method: "PUT",
    path: "/task/notifications/read",
    json: { notification_id: "n-1" },
  },
  {
    name: "notifications read inválido",
    method: "PUT",
    path: "/task/notifications/read",
    json: {},
  },
  // Anexos
  {
    name: "attachment upload",
    method: "POST",
    path: "/task/attachment",
    form: form([
      ["task_id", "t-1"],
      ["file", [pdf(), "contrato.pdf"]],
    ]),
  },
  {
    name: "attachment upload sem arquivo",
    method: "POST",
    path: "/task/attachment",
    form: form([["task_id", "t-1"]]),
  },
  {
    name: "attachment upload tipo proibido",
    method: "POST",
    path: "/task/attachment",
    form: form([
      ["task_id", "t-1"],
      ["file", [new Blob(["x"], { type: "application/zip" }), "a.zip"]],
    ]),
  },
  {
    name: "attachment upload assinatura divergente",
    method: "POST",
    path: "/task/attachment",
    form: form([
      ["task_id", "t-1"],
      ["file", [new Blob(["não é pdf"], { type: "application/pdf" }), "a.pdf"]],
    ]),
  },
  {
    name: "attachment upload campo errado",
    method: "POST",
    path: "/task/attachment",
    form: form([
      ["task_id", "t-1"],
      ["arquivo", [pdf(), "a.pdf"]],
    ]),
  },
  {
    name: "attachment upload sem task_id",
    method: "POST",
    path: "/task/attachment",
    form: form([["file", [pdf(), "a.pdf"]]]),
  },
  { name: "attachment list", method: "GET", path: "/task/attachment/list?task_id=t-1" },
  { name: "attachment list inválido", method: "GET", path: "/task/attachment/list" },
  {
    name: "attachment access",
    method: "GET",
    path: "/task/attachment/access?task_id=t-1&attachment_id=a-1",
  },
  {
    name: "attachment access inválido",
    method: "GET",
    path: "/task/attachment/access?task_id=t-1",
  },
  {
    name: "attachment delete",
    method: "DELETE",
    path: "/task/attachment",
    json: { task_id: "t-1", attachment_id: "a-1" },
  },
  {
    name: "attachment delete inválido",
    method: "DELETE",
    path: "/task/attachment",
    json: { task_id: "t-1" },
  },
  // Financeiro
  {
    name: "financeiro update",
    method: "PUT",
    path: "/task/financeiro",
    json: { task_id: "t-1" },
    headers: { "Idempotency-Key": "k-1" },
  },
  { name: "financeiro update inválido", method: "PUT", path: "/task/financeiro", json: {} },
  { name: "financeiro queue", method: "GET", path: "/task/financeiro/queue?department_id=d-1" },
  { name: "financeiro queue inválido", method: "GET", path: "/task/financeiro/queue?x=1" },
  {
    name: "financeiro collectors set",
    method: "PUT",
    path: "/task/financeiro/collectors",
    json: { department_id: "d-1", collector_ids: ["u-1", "u-2"] },
  },
  {
    name: "financeiro collectors set inválido",
    method: "PUT",
    path: "/task/financeiro/collectors",
    json: {},
  },
  {
    name: "financeiro collectors list",
    method: "GET",
    path: "/task/financeiro/collectors?department_id=d-1",
  },
  {
    name: "financeiro collectors list inválido",
    method: "GET",
    path: "/task/financeiro/collectors",
  },
  {
    name: "financeiro settle",
    method: "POST",
    path: "/task/financeiro/settle",
    json: { task_ids: ["t-1", "t-2"] },
    headers: { "Idempotency-Key": "k-2" },
  },
  {
    name: "financeiro settle chave inválida",
    method: "POST",
    path: "/task/financeiro/settle",
    json: { task_ids: ["t-1"] },
    headers: { "Idempotency-Key": "x".repeat(256) },
  },
  {
    name: "financeiro express",
    method: "POST",
    path: "/task/financeiro/express",
    json: { client_id: "c-1" },
    headers: { "Idempotency-Key": "k-3" },
  },
  {
    name: "financeiro express inválido",
    method: "POST",
    path: "/task/financeiro/express",
    json: {},
  },
  // Plano de projeto
  {
    name: "plan create",
    method: "POST",
    path: "/task/project-plan",
    json: { name: "Plano", color: "#fff" },
  },
  {
    name: "plan create inválido",
    method: "POST",
    path: "/task/project-plan",
    json: { name: "Plano" },
  },
  { name: "plan list", method: "GET", path: "/task/project-plan/list" },
  {
    name: "plan update",
    method: "PUT",
    path: "/task/project-plan",
    json: { id: UUID, name: "P", color: "#000" },
  },
  {
    name: "plan update inválido",
    method: "PUT",
    path: "/task/project-plan",
    json: { id: "x", name: "P", color: "#000" },
  },
  { name: "plan detail", method: "GET", path: `/task/project-plan?plan_id=${UUID}` },
  {
    name: "plan detail repetido",
    method: "GET",
    path: `/task/project-plan?plan_id=${UUID}&plan_id=x`,
  },
  { name: "plan detail inválido", method: "GET", path: "/task/project-plan?plan_id=x" },
  { name: "plan delete", method: "DELETE", path: `/task/project-plan?id=${UUID}` },
  { name: "plan delete body", method: "DELETE", path: "/task/project-plan", json: { id: UUID } },
  { name: "plan delete inválido", method: "DELETE", path: "/task/project-plan" },
  {
    name: "plan task add",
    method: "POST",
    path: "/task/project-plan/task",
    json: { plan_id: UUID, task_id: UUID },
  },
  {
    name: "plan task add inválido",
    method: "POST",
    path: "/task/project-plan/task",
    json: { plan_id: UUID },
  },
  { name: "plan task list", method: "GET", path: `/task/project-plan/task/list?plan_id=${UUID}` },
  { name: "plan task list inválido", method: "GET", path: "/task/project-plan/task/list" },
  {
    name: "plan task reorder",
    method: "PUT",
    path: "/task/project-plan/task",
    json: { plan_id: UUID, plan_task_id: UUID, direction: "up" },
  },
  {
    name: "plan task reorder inválido",
    method: "PUT",
    path: "/task/project-plan/task",
    json: { plan_id: UUID, plan_task_id: UUID, direction: "left" },
  },
  {
    name: "plan task delete",
    method: "DELETE",
    path: "/task/project-plan/task",
    json: { plan_id: UUID, plan_task_id: UUID },
  },
  {
    name: "plan task delete inválido",
    method: "DELETE",
    path: "/task/project-plan/task",
    json: {},
  },
  {
    name: "plan hire",
    method: "POST",
    path: "/task/project-plan/hire",
    json: { project_id: "p-1", plan_id: "pl-1" },
  },
  // Wizard
  {
    name: "wizard preview",
    method: "POST",
    path: "/task/project-wizard/preview",
    json: { tasks: [{ name: "T", department_id: "d-1", model_id: "m-1" }] },
  },
  {
    name: "wizard preview inválido",
    method: "POST",
    path: "/task/project-wizard/preview",
    json: { tasks: [{}] },
  },
  {
    name: "wizard create",
    method: "POST",
    path: "/task/project-wizard",
    json: { client_id: UUID, ...wizardProject, revision: "r-1" },
    headers: { "Idempotency-Key": "w-1" },
  },
  {
    name: "wizard create sem chave",
    method: "POST",
    path: "/task/project-wizard",
    json: { client_id: UUID, ...wizardProject, revision: "r-1" },
  },
  {
    name: "wizard extract json",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    json: { content: "Ata da reunião", ...wizardProject },
  },
  {
    name: "wizard extract json inválido",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    json: { ...wizardProject },
  },
  {
    name: "wizard extract multipart txt",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    form: form([
      ["name", "Projeto"],
      ["start_date", "2026-01-01"],
      ["objective", "Objetivo"],
      ["file", [new Blob(["Ata em texto"], { type: "text/plain" }), "ata.txt"]],
    ]),
  },
  {
    name: "wizard extract multipart vazio",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    form: form([
      ["name", "Projeto"],
      ["start_date", "2026-01-01"],
      ["objective", "Objetivo"],
      ["file", [new Blob([""], { type: "text/plain" }), "ata.txt"]],
    ]),
  },
  {
    name: "wizard extract multipart tipo errado",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    form: form([
      ["name", "Projeto"],
      ["start_date", "2026-01-01"],
      ["objective", "Objetivo"],
      ["file", [new Blob(["x"], { type: "application/pdf" }), "ata.txt"]],
    ]),
  },
  {
    name: "wizard extract multipart utf8 inválido",
    method: "POST",
    path: "/task/project-wizard/extract-tasks",
    form: form([
      ["name", "Projeto"],
      ["start_date", "2026-01-01"],
      ["objective", "Objetivo"],
      ["file", [new Blob([new Uint8Array([0xff, 0xfe, 0x41])], { type: "text/plain" }), "ata.txt"]],
    ]),
  },
  // Dependências
  { name: "deps list", method: "GET", path: "/task/deps/list" },
  { name: "deps options", method: "GET", path: "/task/deps/options?department_id=d-1" },
  {
    name: "deps options sem auth",
    method: "GET",
    path: "/task/deps/options",
    auth: "none",
    statusOnly: true,
  },
  // Internas
  {
    name: "reporting catalog",
    method: "GET",
    path: "/internal/reporting/catalog",
    auth: "none",
    headers: grantHeaders({
      operation: "catalog",
      source: "integracao.catalog",
      fields: [],
      body: {},
    }),
  },
  {
    name: "reporting catalog sem grant",
    method: "GET",
    path: "/internal/reporting/catalog",
    auth: "none",
    headers: { "x-internal-service-token": nodeEnv.reportsInternalToken },
  },
  {
    name: "reporting extract",
    method: "POST",
    path: "/internal/reporting/extract",
    auth: "none",
    json: extractBody,
    headers: grantHeaders({
      operation: "extract",
      source: extractBody.source,
      fields: extractBody.fields,
      body: extractBody,
    }),
  },
  {
    name: "reporting extract token errado",
    method: "POST",
    path: "/internal/reporting/extract",
    auth: "none",
    json: extractBody,
    headers: { "x-internal-service-token": "errado" },
  },
  {
    name: "commercial task-billing",
    method: "POST",
    path: "/internal/commercial/task-billing",
    auth: "none",
    headers: { "x-internal-service-token": nodeEnv.commercialServiceToken },
    json: {
      event_id: UUID,
      event_type: COMMERCIAL_TASK_BILLING_UPDATED_EVENT,
      event_version: COMMERCIAL_TASK_BILLING_EVENT_VERSION,
      organization_id: ORG,
      task_id: UUID,
      hiring_status: "Contratado",
      payment: null,
      billing_description: null,
      audit_correlation_id: "c-1",
      occurred_at: "2026-09-22T10:00:00.000Z",
    },
  },
  {
    name: "commercial task-billing token errado",
    method: "POST",
    path: "/internal/commercial/task-billing",
    auth: "none",
    headers: { "x-internal-service-token": "errado" },
    json: {},
  },
  {
    name: "commercial prospecting-close",
    method: "POST",
    path: "/internal/commercial/prospecting-close",
    auth: "none",
    headers: { "x-internal-service-token": nodeEnv.commercialServiceToken },
    json: {
      event_id: UUID,
      event_type: COMMERCIAL_PROSPECTING_TRANSITION_EVENT,
      event_version: COMMERCIAL_PROSPECTING_EVENT_VERSION,
      organization_id: ORG,
      client_id: UUID,
      prospecting_id: UUID,
      from_status: null,
      to_status: "Fechado",
      status_date: null,
      description: null,
      audit_correlation_id: "c-2",
      occurred_at: "2026-09-22T10:00:00.000Z",
    },
  },
  {
    name: "commercial prospecting-close inválido",
    method: "POST",
    path: "/internal/commercial/prospecting-close",
    auth: "none",
    headers: { "x-internal-service-token": nodeEnv.commercialServiceToken },
    json: { event_id: "x" },
  },
];

type Observed = { status: number; body: unknown; calls: Record<string, unknown[]> };

function serviceCalls(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const [className, klass] of Object.entries(SERVICE_CLASSES)) {
    for (const method of Object.getOwnPropertyNames(klass.prototype)) {
      const fn = klass.prototype[method] as { mock?: { calls: unknown[][] } };
      if (method === "constructor" || !fn?.mock?.calls.length) continue;
      out[`${className}.${method}`] = fn.mock.calls.map((args) =>
        JSON.parse(
          JSON.stringify(args, (_key, value) =>
            value?.type === "Buffer" ? `buffer:${Buffer.from(value.data).toString("hex")}` : value,
          ),
        ),
      );
    }
  }
  return out;
}

function toRequest(base: string, testCase: Case): Request {
  const headers = new Headers({ "x-request-id": REQUEST_ID, ...testCase.headers });
  if ((testCase.auth ?? "owner") === "owner") headers.set("authorization", `Bearer ${owner}`);
  let body: BodyInit | undefined;
  if (testCase.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(testCase.json);
  } else if (testCase.form) {
    body = testCase.form();
  }
  return new Request(`${base}${testCase.path}`, { method: testCase.method, headers, body });
}

async function observe(send: () => Promise<Response>): Promise<Observed> {
  vi.clearAllMocks();
  const response = await send();
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // corpo não-JSON fica como texto
  }
  return { status: response.status, body, calls: serviceCalls() };
}

let server: Server;
let nodeBase: string;

beforeAll(async () => {
  const app = createTaskApp(
    nodeEnv,
    createLogger({
      service: "task-parity",
      env: "test",
      level: "silent",
      destination: new MemoryLogStream(),
    }),
  );
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  nodeBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  // Mesmo retorno nos dois lados para os métodos que o handler repassa.
  for (const klass of Object.values(SERVICE_CLASSES)) {
    for (const method of Object.getOwnPropertyNames(klass.prototype)) {
      if (method === "constructor") continue;
      const fn = klass.prototype[method] as { mockResolvedValue?: (value: unknown) => void };
      fn?.mockResolvedValue?.({ ok: method });
    }
  }
});

describe("paridade task-service: Worker Hono x Express do Node", () => {
  const worker = createTaskWorkerApp({ env: workerEnv, prisma: {} as never });

  it.each(
    CASES.map((testCase) => [testCase.name, testCase] as const),
  )("%s", async (_name, testCase) => {
    const expected = await observe(() => fetch(toRequest(nodeBase, testCase)));
    const actual = await observe(async () =>
      worker.fetch(toRequest("https://task.test", testCase), workerEnv),
    );

    expect(actual.status, JSON.stringify(actual.body)).toBe(expected.status);
    if (testCase.statusOnly) return;
    expect(actual.body).toEqual(expected.body);
    expect(actual.calls).toEqual(expected.calls);
  });

  it("cobre todas as rotas do Node", () => {
    const covered = new Set(CASES.map(({ method, path }) => `${method} ${path.split("?")[0]}`));
    expect(covered.size).toBe(57);
  });

  it("não expõe rota fora do contrato", async () => {
    const response = await worker.fetch(
      new Request("https://task.test/task/inexistente", {
        headers: { authorization: `Bearer ${owner}` },
      }),
      workerEnv,
    );
    expect(response.status).toBe(404);
  });

  it("aceita uma chave de idempotência gerada quando o financeiro não recebe header", async () => {
    const request = () =>
      new Request("https://task.test/task/financeiro", {
        method: "PUT",
        headers: { authorization: `Bearer ${owner}`, "content-type": "application/json" },
        body: JSON.stringify({ task_id: "t-1" }),
      });
    vi.clearAllMocks();
    const response = await worker.fetch(request(), workerEnv);
    expect(response.status).toBe(200);
    const [[input]] = vi.mocked(taskFinanceiro.TaskFinanceiroService.prototype.settle).mock.calls;
    expect(input.idempotency_key).toMatch(/^[0-9a-f-]{36}$/u);
    expect(randomUUID()).not.toBe(input.idempotency_key);
  });
});
