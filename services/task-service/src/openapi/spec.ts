import { MAX_REPORTING_QUERY_LIMIT, reportingQueryOpenApiSchema } from "@workspace/shared";
import type { OpenApiDocument } from "@workspace/shared/http";

import type { TaskServiceEnv } from "../config/env.js";
import { TASK_ASSIGNMENT_FILTER_VALUES } from "../constants/integracaoTask.js";
import { DOCX_MIME_TYPE } from "../utils/docx.js";
import { PDF_MIME_TYPE } from "../utils/pdf.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const bearer: Array<Record<string, string[]>> = [{ bearerAuth: [] }];

function createObjectRequestBody(options: {
  example: Record<string, unknown>;
  properties: Record<string, unknown>;
  required?: string[];
}) {
  const { example, properties, required } = options;

  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties,
            ...(required ? { required } : {}),
            example,
          },
        },
      },
    },
  } as const;
}

const createTaskRequestBody = createObjectRequestBody({
  example: {
    model_id: "task-model-uuid",
    project_id: "project-uuid",
    client_id: "client-uuid",
    prospecting_status: "Analise Financeira",
    name: "Contato com cliente",
    status: "Em Andamento",
    department_id: "department-uuid",
    observations: "Priorizar validacao documental.",
    billing: "Realizar",
    urgency: "ALTA",
    responsible_id: "user-uuid",
    prevision_date: "2026-04-10",
  },
  required: [
    "model_id",
    "project_id",
    "client_id",
    "prospecting_status",
    "urgency",
    "department_id",
  ],
  properties: {
    model_id: { type: "string" },
    project_id: { type: "string" },
    client_id: { type: "string" },
    prospecting_status: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    department_id: { type: "string" },
    observations: { type: "string" },
    billing: { type: "string" },
    urgency: { type: "string" },
    responsible_id: { type: ["string", "null"] },
    prevision_date: { type: "string", format: "date" },
  },
});

const updateTaskRequestBody = createObjectRequestBody({
  example: {
    task_id: "task-uuid",
    model_id: "task-model-uuid",
    name: "Contato com cliente",
    status: "Em Andamento",
    department_id: "department-uuid",
    observations: "Cliente enviou novos documentos.",
    billing: "Realizar",
    urgency: "MEDIA",
    responsible_id: "user-uuid",
  },
  required: ["task_id"],
  properties: {
    task_id: { type: "string" },
    model_id: { type: "string" },
    name: { type: "string" },
    status: { type: "string" },
    department_id: { type: "string" },
    observations: { type: "string" },
    billing: { type: "string" },
    urgency: { type: "string" },
    responsible_id: { type: ["string", "null"] },
  },
});

const createTaskModelRequestBody = createObjectRequestBody({
  example: {
    name: "Abertura de processo",
    department_id: "department-uuid",
    responsible_id: "user-uuid",
    responsible2_id: "backup-user-uuid",
    responsible3_id: null,
    observations: "Fluxo padrao do time de integracao.",
    billing: "mensal",
    prevision: 3,
    type: "regularize",
  },
  required: ["name", "department_id", "responsible_id", "billing", "prevision"],
  properties: {
    name: { type: "string" },
    department_id: { type: "string" },
    responsible_id: { type: "string" },
    responsible2_id: { type: ["string", "null"] },
    responsible3_id: { type: ["string", "null"] },
    observations: { type: ["string", "null"] },
    billing: { type: "string" },
    prevision: { type: "number" },
    type: { type: ["string", "null"] },
  },
});

const updateTaskModelRequestBody = createObjectRequestBody({
  example: {
    task_id: "task-model-uuid",
    name: "Abertura de processo - revisado",
    department_id: "department-uuid",
    responsible_id: "user-uuid",
    responsible2_id: "backup-user-uuid",
    responsible3_id: null,
    observations: "Novo SLA combinado com o cliente.",
    billing: "mensal",
    prevision: 5,
    type: "regularize",
  },
  required: ["task_id", "name", "department_id", "responsible_id", "billing", "prevision"],
  properties: {
    task_id: { type: "string" },
    name: { type: "string" },
    department_id: { type: "string" },
    responsible_id: { type: "string" },
    responsible2_id: { type: ["string", "null"] },
    responsible3_id: { type: ["string", "null"] },
    observations: { type: ["string", "null"] },
    billing: { type: "string" },
    prevision: { type: "number" },
    type: { type: ["string", "null"] },
  },
});

const createTaskDependentRequestBody = createObjectRequestBody({
  example: {
    task_model_id: "task-model-uuid",
    dependent_id: "dependent-task-model-uuid",
    wait: true,
    observation: "Executar somente apos validar a etapa anterior.",
  },
  required: ["task_model_id", "dependent_id", "wait", "observation"],
  properties: {
    task_model_id: { type: "string" },
    dependent_id: { type: "string" },
    wait: { type: "boolean" },
    observation: { type: "string" },
  },
});

const createTaskIntegrationRequestBody = createObjectRequestBody({
  example: {
    task_model_id: "task-model-uuid",
    referring: "regularize-process-uuid",
    referring_type: "process",
  },
  required: ["task_model_id", "referring", "referring_type"],
  properties: {
    task_model_id: { type: "string" },
    referring: { type: "string" },
    referring_type: { type: "string", enum: ["process", "license"] },
  },
});

const deleteTaskIntegrationRequestBody = createObjectRequestBody({
  example: { integration_id: "integration-link-uuid" },
  required: ["integration_id"],
  properties: {
    integration_id: { type: "string" },
  },
});

const settleFinanceiroRequestBody = createObjectRequestBody({
  example: { task_ids: ["task-uuid"] },
  required: ["task_ids"],
  properties: {
    task_ids: { type: "array", items: { type: "string" }, minItems: 1 },
  },
});

const expressFinanceiroRequestBody = createObjectRequestBody({
  example: { client_id: "client-uuid" },
  required: ["client_id"],
  properties: {
    client_id: { type: "string" },
  },
});

const collectorsFinanceiroRequestBody = createObjectRequestBody({
  example: { department_id: "department-uuid", collector_ids: ["user-uuid"] },
  required: ["department_id", "collector_ids"],
  properties: {
    department_id: { type: "string" },
    collector_ids: { type: "array", items: { type: "string" } },
  },
});

const financeiroIdempotencyHeader = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 255 },
} as const;

const concludeTaskRequestBody = createObjectRequestBody({
  example: {
    task_id: "task-uuid",
    status: "Concluida",
    end_date: "2026-04-12T18:00:00.000Z",
    responsible_id: "user-uuid",
    responsible2_id: "backup-user-uuid",
    responsible3_id: null,
    observations: "Documentacao revisada e concluida.",
    justification: "Todos os anexos obrigatorios foram validados.",
  },
  required: ["task_id", "status", "responsible_id"],
  properties: {
    task_id: { type: "string" },
    status: { type: "string" },
    end_date: { type: ["string", "null"], format: "date-time" },
    responsible_id: { type: ["string", "null"] },
    responsible2_id: { type: ["string", "null"] },
    responsible3_id: { type: ["string", "null"] },
    observations: { type: "string" },
    justification: { type: "string" },
  },
});

const approveConclusionRequestBody = createObjectRequestBody({
  example: { task_id: "task-uuid", request_id: "completion-request-uuid", decision: "approved" },
  required: ["task_id"],
  properties: {
    task_id: { type: "string" },
    request_id: { type: "string" },
    decision: { type: "string", enum: ["approved", "refused"] },
    reason: { type: "string" },
  },
});

const createConclusionRequestBody = createObjectRequestBody({
  example: { task_id: "task-uuid", reason: "Documentação revisada." },
  required: ["task_id"],
  properties: {
    task_id: { type: "string" },
    reason: { type: "string" },
  },
});

const createTaskPostponementRequestBody = createObjectRequestBody({
  example: {
    task_id: "task-uuid",
    new_prevision_date: "2026-04-20",
    justification: "Aguardando documento obrigatório do cliente.",
  },
  required: ["task_id", "new_prevision_date", "justification"],
  properties: {
    task_id: { type: "string" },
    new_prevision_date: { type: "string", format: "date" },
    justification: { type: "string", minLength: 1, maxLength: 2000 },
  },
});

const reopenTaskRequestBody = createObjectRequestBody({
  example: { task_id: "task-uuid", reason: "Documento complementar pendente." },
  required: ["task_id", "reason"],
  properties: {
    task_id: { type: "string" },
    reason: { type: "string" },
  },
});

const createProjectPlanRequestBody = createObjectRequestBody({
  example: {
    name: "Plano de onboarding",
    color: "#1F6FEB",
  },
  required: ["name", "color"],
  properties: {
    name: { type: "string" },
    color: { type: "string" },
  },
});

const updateProjectPlanRequestBody = createObjectRequestBody({
  example: {
    id: "project-plan-uuid",
    name: "Plano de onboarding - revisado",
    color: "#0F766E",
  },
  required: ["id", "name", "color"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    color: { type: "string" },
  },
});

const addProjectPlanTaskRequestBody = createObjectRequestBody({
  example: {
    plan_id: "project-plan-uuid",
    task_id: "task-model-uuid",
  },
  required: ["plan_id", "task_id"],
  properties: {
    plan_id: { type: "string" },
    task_id: { type: "string" },
  },
});

const reorderProjectPlanTaskRequestBody = createObjectRequestBody({
  example: {
    plan_id: "project-plan-uuid",
    plan_task_id: "project-plan-task-uuid",
    direction: "up",
  },
  required: ["plan_id", "plan_task_id", "direction"],
  properties: {
    plan_id: { type: "string" },
    plan_task_id: { type: "string" },
    direction: { type: "string", enum: ["up", "down"] },
  },
});

const deleteProjectPlanTaskRequestBody = createObjectRequestBody({
  example: {
    plan_id: "project-plan-uuid",
    plan_task_id: "project-plan-task-uuid",
  },
  required: ["plan_id", "plan_task_id"],
  properties: {
    plan_id: { type: "string" },
    plan_task_id: { type: "string" },
  },
});

const hireProjectPlanRequestBody = createObjectRequestBody({
  example: {
    project_id: "project-uuid",
    plan_id: "project-plan-uuid",
  },
  required: ["project_id", "plan_id"],
  properties: {
    project_id: { type: "string" },
    plan_id: { type: "string" },
  },
});

const createProjectWizardRequestBody = createObjectRequestBody({
  example: {
    client_id: "client-uuid",
    name: "Novo projeto",
    start_date: "2026-09-01T00:00:00.000Z",
    end_date: "2026-09-30T00:00:00.000Z",
    objective: "Objetivo do projeto",
    revision: "revisao-opaca-da-previa",
    tasks: [
      {
        name: "Revisar documentação",
        department_id: "department-uuid",
        model_id: "task-model-uuid",
        prevision_date: "2026-09-15",
        responsible_id: "user-uuid",
      },
    ],
  },
  required: ["client_id", "name", "start_date", "objective", "revision"],
  properties: {
    client_id: { type: "string", format: "uuid" },
    name: { type: "string" },
    start_date: { type: "string", format: "date-time" },
    end_date: { type: "string", format: "date-time" },
    objective: { type: "string" },
    revision: { type: "string", description: "Revisão opaca retornada pela prévia do wizard." },
    tasks: {
      type: "array",
      description: "Modelos repetidos na composição canônica retornam conflito.",
      items: {
        type: "object",
        required: ["name", "department_id", "model_id"],
        properties: {
          name: { type: "string" },
          department_id: { type: "string" },
          model_id: { type: "string" },
          prevision_date: { type: "string", format: "date" },
          responsible_id: { type: ["string", "null"] },
        },
      },
    },
  },
});

const projectWizardPreviewRequestBody = createObjectRequestBody({
  example: {
    tasks: [
      {
        name: "Revisar documentação",
        department_id: "department-uuid",
        model_id: "task-model-uuid",
      },
    ],
  },
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "department_id", "model_id"],
        properties: {
          name: { type: "string" },
          department_id: { type: "string" },
          model_id: { type: "string" },
          prevision_date: { type: "string", format: "date" },
          responsible_id: { type: ["string", "null"] },
        },
      },
    },
  },
});

const extractProjectWizardTasksProperties = {
  content: {
    type: "string",
    description:
      "Ata de reunião em texto, com conteúdo de até 10 MiB em bytes UTF-8. Conteúdo transitório: não é persistido, auditado nem registrado em log.",
  },
  name: { type: "string" },
  objective: { type: "string" },
  start_date: { type: "string", format: "date-time" },
  end_date: { type: "string", format: "date-time" },
};

const extractProjectWizardTasksRequestBody = {
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["content", "name", "objective", "start_date"],
          properties: extractProjectWizardTasksProperties,
        },
      },
      "multipart/form-data": {
        schema: {
          type: "object",
          required: ["file", "name", "objective", "start_date"],
          properties: {
            file: {
              type: "string",
              format: "binary",
              description:
                `Ata .txt, .md, .docx ou .pdf de até 10 MB; aceita text/plain para .txt, text/markdown, ` +
                `text/plain ou text/x-markdown para .md, ${DOCX_MIME_TYPE} para .docx e ${PDF_MIME_TYPE} ` +
                `para .pdf; só o texto já presente no arquivo é lido, sem OCR e sem executar macros, ` +
                `campos ativos ou ações; conteúdo transitório.`,
            },
            name: extractProjectWizardTasksProperties.name,
            objective: extractProjectWizardTasksProperties.objective,
            start_date: extractProjectWizardTasksProperties.start_date,
            end_date: extractProjectWizardTasksProperties.end_date,
          },
        },
      },
    },
  },
};

export function buildTaskServiceOpenApiSpec(env: TaskServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "task-service",
      version: "1.0.0",
      description:
        "Tarefas, modelos, integracao Regularize, financeiro e comercial. Endpoints marcados exigem JWT. " +
        "modules.integracao aplica tarefas próprias nos níveis 0–1, leitura organizacional a partir de 1, " +
        "criação/edição a partir de 2 e administração/exclusão a partir de 3; modelos são consultáveis a partir de 2.",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saude do servico" },
      { name: "IntegracaoTasks", description: "CRUD tarefas de integracao" },
      { name: "TaskModel", description: "Modelos de tarefa" },
      { name: "ProjectPlan", description: "Planos de projeto" },
      { name: "ProjectWizard", description: "Criação de projeto com tarefas manuais" },
      { name: "TaskDependent", description: "Dependencias entre modelos" },
      { name: "TaskIntegration", description: "Vinculos integracao Regularize" },
      { name: "Financeiro", description: "Cobranca financeira" },
      { name: "Lifecycle", description: "Conclusao e aprovacao" },
      { name: "Notifications", description: "Notificações operacionais por destinatário" },
      { name: "InternalReporting", description: "Fonte interna governada para relatórios" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        internalServiceToken: {
          type: "apiKey",
          in: "header",
          name: "x-internal-service-token",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrao do workspace",
          additionalProperties: true,
        },
        ReportingGrantV1: {
          type: "object",
          additionalProperties: false,
          required: [
            "version",
            "audience",
            "operation",
            "source",
            "organization_id",
            "fields",
            "request_id",
            "issued_at",
            "expires_at",
            "body_sha256",
          ],
          properties: {
            version: { type: "integer", enum: [1] },
            audience: { type: "string", enum: ["task-service"] },
            operation: { type: "string", enum: ["catalog", "extract"] },
            source: { type: "string" },
            organization_id: { type: "string", format: "uuid" },
            fields: { type: "array", uniqueItems: true, items: { type: "string" } },
            request_id: { type: "string" },
            issued_at: { type: "integer", minimum: 0 },
            expires_at: { type: "integer", minimum: 0 },
            body_sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
          },
        },
      },
    },
    paths: {
      "/internal/reporting/catalog": {
        get: {
          tags: ["InternalReporting"],
          summary: "Consultar catálogo interno de Tarefas",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant",
              in: "header",
              required: true,
              description: "Grant v1: JSON canônico codificado em base64url.",
              schema: { type: "string" },
            },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Catálogo governado" },
            "403": { description: "Grant ou token interno inválido" },
          },
        },
      },
      "/internal/reporting/extract": {
        post: {
          tags: ["InternalReporting"],
          summary: "Extrair campos governados para relatórios",
          security: [{ internalServiceToken: [] }],
          parameters: [
            {
              name: "x-internal-service-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
            { name: "x-request-id", in: "header", required: true, schema: { type: "string" } },
            { name: "x-reports-grant", in: "header", required: true, schema: { type: "string" } },
            {
              name: "x-reports-grant-signature",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["source", "fields", "limit"],
                  additionalProperties: false,
                  properties: {
                    source: { type: "string", enum: ["integracao.tasks"] },
                    fields: { type: "array", minItems: 1, items: { type: "string" } },
                    limit: { type: "integer", minimum: 1, maximum: MAX_REPORTING_QUERY_LIMIT },
                    query: reportingQueryOpenApiSchema,
                  },
                },
              },
            },
          },
          responses: {
            "422": { description: "Capacidade de consulta excedida; nenhum resultado parcial" },
            "200": { description: "Linhas extraídas" },
            "400": { description: "Entrada inválida" },
            "403": { description: "Grant, token ou campo inválido" },
          },
        },
      },
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/ready": {
        get: {
          tags: ["Health"],
          summary: "Readiness check",
          responses: {
            "200": { description: "Ready", ...successJson },
          },
        },
      },
      "/task": {
        post: {
          tags: ["IntegracaoTasks"],
          summary: "Criar tarefa",
          security: bearer,
          ...createTaskRequestBody,
          responses: { "201": { description: "Criada", ...successJson } },
        },
        get: {
          tags: ["IntegracaoTasks"],
          summary: "Detalhe da tarefa",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        put: {
          tags: ["IntegracaoTasks"],
          summary: "Atualizar tarefa",
          security: bearer,
          ...updateTaskRequestBody,
          responses: { "200": { description: "Atualizada", ...successJson } },
        },
        delete: {
          tags: ["IntegracaoTasks"],
          summary: "Excluir tarefa",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Excluida", ...successJson } },
        },
      },
      "/task/list": {
        get: {
          tags: ["IntegracaoTasks"],
          summary: "Listar tarefas",
          security: bearer,
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "ref", in: "query", schema: { type: "string" } },
            { name: "ref_id", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "client_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "assignment",
              in: "query",
              schema: { type: "string", enum: TASK_ASSIGNMENT_FILTER_VALUES },
            },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            "200": {
              description: "Lista paginada com totais sobre o resultado filtrado completo",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["success", "data"],
                    properties: {
                      success: { type: "boolean", enum: [true] },
                      data: {
                        type: "object",
                        required: ["data", "total", "hasMore", "summary"],
                        properties: {
                          data: {
                            type: "array",
                            items: {
                              type: "object",
                              required: ["id", "isOwn", "isUnassigned"],
                              properties: {
                                id: { type: "string" },
                                isOwn: { type: "boolean" },
                                isUnassigned: { type: "boolean" },
                              },
                            },
                          },
                          total: { type: "integer", minimum: 0 },
                          hasMore: { type: "boolean" },
                          summary: {
                            type: "object",
                            required: ["inProgress", "billable"],
                            properties: {
                              inProgress: { type: "integer", minimum: 0 },
                              billable: { type: "integer", minimum: 0 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/task/model": {
        post: {
          tags: ["TaskModel"],
          summary: "Criar modelo de tarefa",
          security: bearer,
          ...createTaskModelRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        get: {
          tags: ["TaskModel"],
          summary: "Detalhe do modelo",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        put: {
          tags: ["TaskModel"],
          summary: "Atualizar modelo",
          security: bearer,
          ...updateTaskModelRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
        delete: {
          tags: ["TaskModel"],
          summary: "Excluir modelo",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Excluido", ...successJson } },
        },
      },
      "/task/model/list": {
        get: {
          tags: ["TaskModel"],
          summary: "Listar modelos",
          description: "Lista modelos da organizacao. type e billing sao filtros opcionais.",
          security: bearer,
          parameters: [
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "billing", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Array completo sem paginacao ou pagina quando page/limit e enviado",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                          data: { type: "array", items: { type: "object" } },
                        },
                      },
                      {
                        type: "object",
                        properties: {
                          success: { type: "boolean" },
                          data: {
                            type: "object",
                            required: ["data", "total", "page", "limit", "hasMore"],
                            properties: {
                              data: { type: "array", items: { type: "object" } },
                              total: { type: "integer" },
                              page: { type: "integer" },
                              limit: { type: "integer" },
                              hasMore: { type: "boolean" },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      "/task/model/dependent": {
        post: {
          tags: ["TaskDependent"],
          summary: "Adicionar dependente ao modelo",
          security: bearer,
          ...createTaskDependentRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        get: {
          tags: ["TaskDependent"],
          summary: "Listar dependentes",
          security: bearer,
          parameters: [{ name: "task_model_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Lista", ...successJson } },
        },
        delete: {
          tags: ["TaskDependent"],
          summary: "Remover dependente",
          security: bearer,
          parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Removido", ...successJson } },
        },
      },
      "/task/integration": {
        post: {
          tags: ["TaskIntegration"],
          summary: "Criar vinculo Regularize",
          security: bearer,
          ...createTaskIntegrationRequestBody,
          responses: {
            "201": { description: "Criado", ...successJson },
            "400": { description: "Tipo de destino inválido." },
            "403": { description: "Acesso negado." },
            "404": { description: "Modelo ou destino não encontrado." },
            "409": { description: "Vínculo já existe." },
          },
        },
        delete: {
          tags: ["TaskIntegration"],
          summary: "Remover vinculo",
          security: bearer,
          ...deleteTaskIntegrationRequestBody,
          responses: {
            "200": { description: "Removido", ...successJson },
            "403": { description: "Acesso negado." },
            "404": { description: "Vínculo não encontrado." },
          },
        },
        get: {
          tags: ["TaskIntegration"],
          summary: "Listar vínculos e disponibilidade dos destinos",
          security: bearer,
          parameters: [{ name: "task_model_id", in: "query", schema: { type: "string" } }],
          responses: {
            "200": {
              description: "Lista; vínculos de destinos removidos têm available=false.",
              ...successJson,
            },
            "403": { description: "Acesso negado." },
            "404": { description: "Modelo não encontrado no escopo da organização." },
          },
        },
      },
      "/task/financeiro/queue": {
        get: {
          tags: ["Financeiro"],
          summary: "Listar fila financeira no escopo do cobrador",
          security: bearer,
          parameters: [
            { name: "department_id", in: "query", schema: { type: "string" } },
            { name: "client_id", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Fila pendente", ...successJson },
            "403": { description: "Fora do escopo" },
          },
        },
      },
      "/task/financeiro/collectors": {
        get: {
          tags: ["Financeiro"],
          summary: "Listar cobradores ativos do departamento",
          security: bearer,
          parameters: [
            { name: "department_id", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Cobradores", ...successJson },
            "403": { description: "Somente administradores" },
          },
        },
        put: {
          tags: ["Financeiro"],
          summary: "Configurar cobradores ativos do departamento",
          security: bearer,
          ...collectorsFinanceiroRequestBody,
          responses: {
            "200": { description: "Configurado", ...successJson },
            "403": { description: "Somente administradores" },
          },
        },
      },
      "/task/financeiro/settle": {
        post: {
          tags: ["Financeiro"],
          summary: "Baixar tarefas financeiras atomicamente",
          description:
            "O mesmo Idempotency-Key e o mesmo lote retornam o resultado original; outra carga retorna conflito.",
          security: bearer,
          parameters: [financeiroIdempotencyHeader],
          ...settleFinanceiroRequestBody,
          responses: {
            "200": { description: "Baixa realizada ou repetida", ...successJson },
            "403": { description: "Cobrador fora do departamento" },
            "409": { description: "Conflito de chave ou lote não pendente" },
          },
        },
      },
      "/task/financeiro/express": {
        post: {
          tags: ["Financeiro"],
          summary: "Baixar toda a fila atual de um cliente",
          security: bearer,
          parameters: [financeiroIdempotencyHeader],
          ...expressFinanceiroRequestBody,
          responses: {
            "200": { description: "Baixa realizada", ...successJson },
            "403": { description: "Fora do escopo" },
            "409": { description: "Fila alterada" },
          },
        },
      },
      "/internal/commercial/task-billing": {
        post: {
          tags: ["Commercial"],
          summary: "Projetar cobrança comercial na tarefa",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": successJson,
            "400": { description: "Evento inválido." },
            "403": { description: "Acesso negado." },
          },
        },
      },
      "/internal/commercial/prospecting-close": {
        post: {
          tags: ["Commercial"],
          summary: "Aplicar fechamento comercial e devolver competência",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object" } } },
          },
          responses: {
            "200": successJson,
            "400": { description: "Evento inválido." },
            "403": { description: "Acesso negado." },
          },
        },
      },
      "/task/conclusion": {
        put: {
          tags: ["Lifecycle"],
          summary: "Concluir tarefa (fluxo de status)",
          security: bearer,
          ...concludeTaskRequestBody,
          responses: { "200": { description: "Concluido", ...successJson } },
        },
      },
      "/task/complete-request": {
        post: {
          tags: ["Lifecycle"],
          summary: "Solicitar conclusão de tarefa",
          security: bearer,
          ...createConclusionRequestBody,
          responses: {
            "200": { description: "Solicitação criada", ...successJson },
            "409": { description: "Já existe uma solicitação pendente" },
          },
        },
        put: {
          tags: ["Lifecycle"],
          summary: "Aprovar ou recusar pedido de conclusao",
          security: bearer,
          ...approveConclusionRequestBody,
          responses: { "200": { description: "Decidido", ...successJson } },
        },
        delete: {
          tags: ["Lifecycle"],
          summary: "Cancelar solicitação de conclusão",
          security: bearer,
          ...approveConclusionRequestBody,
          responses: { "200": { description: "Cancelado", ...successJson } },
        },
      },
      "/task/complete-request/list": {
        get: {
          tags: ["Lifecycle"],
          summary: "Listar histórico de solicitações de conclusão",
          security: bearer,
          parameters: [
            { name: "task_id", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Histórico", ...successJson } },
        },
      },
      "/task/postponement": {
        post: {
          tags: ["Lifecycle"],
          summary: "Prorrogar tarefa vencida em andamento",
          security: bearer,
          ...createTaskPostponementRequestBody,
          responses: {
            "201": { description: "Prorrogação registrada", ...successJson },
            "400": { description: "Dados inválidos" },
            "409": { description: "Tarefa sem elegibilidade ou data inválida" },
          },
        },
      },
      "/task/postponement/list": {
        get: {
          tags: ["Lifecycle"],
          summary: "Listar histórico de prorrogações da tarefa",
          security: bearer,
          parameters: [
            { name: "task_id", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Histórico", ...successJson } },
        },
      },
      "/task/notifications": {
        get: {
          tags: ["Notifications"],
          summary: "Listar notificações operacionais do destinatário autenticado",
          security: bearer,
          responses: { "200": { description: "Caixa de entrada", ...successJson } },
        },
      },
      "/task/notifications/read": {
        put: {
          tags: ["Notifications"],
          summary: "Marcar notificação operacional como lida",
          security: bearer,
          ...createObjectRequestBody({
            example: { notification_id: "notification-uuid" },
            required: ["notification_id"],
            properties: { notification_id: { type: "string" } },
          }),
          responses: { "200": { description: "Notificação lida", ...successJson } },
        },
      },
      "/task/attachment": {
        post: {
          tags: ["TaskAttachment"],
          summary: "Anexar arquivo privado à tarefa",
          security: bearer,
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["task_id", "file"],
                  properties: {
                    task_id: { type: "string" },
                    file: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Anexo criado", ...successJson },
            "400": { description: "Arquivo inválido ou acima de 10 MB" },
          },
        },
        delete: {
          tags: ["TaskAttachment"],
          summary: "Remover logicamente anexo da tarefa",
          security: bearer,
          ...createObjectRequestBody({
            example: { task_id: "task-uuid", attachment_id: "attachment-uuid" },
            required: ["task_id", "attachment_id"],
            properties: { task_id: { type: "string" }, attachment_id: { type: "string" } },
          }),
          responses: { "200": { description: "Anexo removido", ...successJson } },
        },
      },
      "/task/attachment/list": {
        get: {
          tags: ["TaskAttachment"],
          summary: "Listar metadados de anexos privados da tarefa",
          security: bearer,
          parameters: [
            { name: "task_id", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Anexos", ...successJson } },
        },
      },
      "/task/attachment/access": {
        get: {
          tags: ["TaskAttachment"],
          summary: "Gerar URL assinada temporária para anexo privado",
          security: bearer,
          parameters: [
            { name: "task_id", in: "query", required: true, schema: { type: "string" } },
            { name: "attachment_id", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "URL assinada", ...successJson } },
        },
      },
      "/task/reopen": {
        put: {
          tags: ["Lifecycle"],
          summary: "Reabrir tarefa concluída",
          security: bearer,
          ...reopenTaskRequestBody,
          responses: { "200": { description: "Reaberta", ...successJson } },
        },
      },
      "/task/project-plan": {
        post: {
          tags: ["ProjectPlan"],
          summary: "Criar plano de projeto",
          security: bearer,
          ...createProjectPlanRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        get: {
          tags: ["ProjectPlan"],
          summary: "Detalhar plano de projeto",
          security: bearer,
          parameters: [{ name: "plan_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        put: {
          tags: ["ProjectPlan"],
          summary: "Atualizar plano de projeto",
          security: bearer,
          ...updateProjectPlanRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
        delete: {
          tags: ["ProjectPlan"],
          summary: "Excluir plano de projeto",
          security: bearer,
          parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Excluido", ...successJson } },
        },
      },
      "/task/project-plan/list": {
        get: {
          tags: ["ProjectPlan"],
          summary: "Listar planos de projeto",
          security: bearer,
          responses: { "200": { description: "Lista", ...successJson } },
        },
      },
      "/task/project-plan/task": {
        post: {
          tags: ["ProjectPlan"],
          summary: "Adicionar tarefa ao plano",
          security: bearer,
          ...addProjectPlanTaskRequestBody,
          responses: { "201": { description: "Criada", ...successJson } },
        },
        put: {
          tags: ["ProjectPlan"],
          summary: "Reordenar tarefa do plano",
          security: bearer,
          ...reorderProjectPlanTaskRequestBody,
          responses: { "200": { description: "Reordenada", ...successJson } },
        },
        delete: {
          tags: ["ProjectPlan"],
          summary: "Remover tarefa do plano",
          security: bearer,
          ...deleteProjectPlanTaskRequestBody,
          responses: { "200": { description: "Removida", ...successJson } },
        },
      },
      "/task/project-plan/task/list": {
        get: {
          tags: ["ProjectPlan"],
          summary: "Listar tarefas do plano",
          security: bearer,
          parameters: [{ name: "plan_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Lista", ...successJson } },
        },
      },
      "/task/project-plan/hire": {
        post: {
          tags: ["ProjectPlan"],
          summary: "Contratar plano em projeto",
          security: bearer,
          ...hireProjectPlanRequestBody,
          responses: { "200": { description: "Contratado", ...successJson } },
        },
      },
      "/task/project-wizard": {
        post: {
          tags: ["ProjectWizard"],
          summary: "Confirmar projeto e tarefas atomicamente pelo wizard",
          description:
            "Idempotência por organização e chave: o mesmo comando, inclusive concorrente, retorna o snapshot original sem novas criações. Auditoria após commit, somente na criação nova, com IDs e contagens; falha de auditoria não altera a resposta.",
          security: bearer,
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: true,
              description: "Na mesma organização, reutilize a chave apenas para o mesmo comando.",
              schema: { type: "string", minLength: 1, maxLength: 255 },
            },
          ],
          ...createProjectWizardRequestBody,
          responses: {
            "201": {
              description:
                "Projeto, tarefas principais e dependências criados, ou snapshot original no replay",
              ...successJson,
            },
            "400": { description: "Entrada ou chave inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão de Integração" },
            "404": { description: "Cliente não encontrado na organização" },
            "409": {
              description: "Chave usada com outro comando, prévia desatualizada ou Modelo repetido",
            },
            "500": { description: "Falha na confirmação; nenhuma criação parcial é persistida" },
          },
        },
      },
      "/task/project-wizard/extract-tasks": {
        post: {
          tags: ["ProjectWizard"],
          summary: "Extrair Tarefas propostas de uma Ata com a OpenAI",
          description:
            "Exige nível 2+ em Integração ou owner. Atas extensas são processadas integralmente em partes; uma falha em qualquer parte invalida a Ata inteira. A Ata e a resposta bruta do provedor são transitórias.",
          security: bearer,
          ...extractProjectWizardTasksRequestBody,
          responses: {
            "200": { description: "Tarefas propostas para revisão", ...successJson },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão de Integração" },
            "422": { description: "Nenhuma tarefa identificada na Ata" },
            "429": { description: "Muitas extrações seguidas" },
            "502": { description: "Falha do provedor de IA" },
          },
        },
      },
      "/task/project-wizard/preview": {
        post: {
          tags: ["ProjectWizard"],
          summary: "Gerar prévia canônica das tarefas e dependências do wizard",
          security: bearer,
          ...projectWizardPreviewRequestBody,
          responses: {
            "200": { description: "Prévia e revisão opaca", ...successJson },
            "400": { description: "Entrada inválida" },
            "401": { description: "Não autenticado" },
            "403": { description: "Sem permissão de Integração" },
            "409": { description: "Modelo repetido na composição" },
            "422": { description: "Modelo, departamento ou responsável inelegível" },
          },
        },
      },
      "/task/deps/list": {
        get: {
          tags: ["TaskDependent"],
          summary: "Listar departamentos com modelos de tarefa",
          security: bearer,
          responses: { "200": { description: "Lista", ...successJson } },
        },
      },
      "/task/deps/options": {
        get: {
          tags: ["TaskDependent"],
          summary: "Listar opções ativas para modelos de tarefa",
          security: bearer,
          parameters: [
            {
              name: "department_id",
              in: "query",
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: { "200": { description: "Opções", ...successJson } },
        },
      },
    },
  };
}
