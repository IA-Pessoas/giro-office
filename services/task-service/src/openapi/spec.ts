import type { OpenApiDocument } from "@workspace/shared/http";

import type { TaskServiceEnv } from "../config/env.js";

const successJson = {
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/SuccessEnvelope" },
    },
  },
} as const;

const bearer: Array<Record<string, string[]>> = [{ bearerAuth: [] }];

function createJsonRequestBody(example: Record<string, unknown>) {
  return {
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: true,
            example,
          },
        },
      },
    },
  } as const;
}

const createTaskRequestBody = createJsonRequestBody({
  model_id: "task-model-uuid",
  project_id: "project-uuid",
  client_id: "client-uuid",
  prospecting_status: "EM_ANDAMENTO",
  observations: "Priorizar validacao documental.",
  urgency: "ALTA",
});

const updateTaskRequestBody = createJsonRequestBody({
  task_id: "task-uuid",
  observations: "Cliente enviou novos documentos.",
  urgency: "MEDIA",
  prospecting_status: "CONCLUIDO",
});

const createTaskModelRequestBody = createJsonRequestBody({
  name: "Abertura de processo",
  department_id: "department-uuid",
  responsible_id: "user-uuid",
  responsible2_id: "backup-user-uuid",
  responsible3_id: null,
  observations: "Fluxo padrao do time de integracao.",
  billing: "mensal",
  prevision: 3,
  type: "regularize",
});

const updateTaskModelRequestBody = createJsonRequestBody({
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
});

const createTaskDependentRequestBody = createJsonRequestBody({
  task_model_id: "task-model-uuid",
  dependent_task_model_id: "dependent-task-model-uuid",
});

const createTaskIntegrationRequestBody = createJsonRequestBody({
  task_model_id: "task-model-uuid",
  integration_step_id: "integration-step-uuid",
});

const updateFinanceiroRequestBody = createJsonRequestBody({
  task_id: "task-uuid",
  billing_status: "FATURADO",
  amount: 1499.9,
  observations: "Cobranca aprovada pelo financeiro.",
});

const updateComercialRequestBody = createJsonRequestBody({
  task_id: "task-uuid",
  comercial_status: "NEGOCIADO",
  observations: "Cliente aprovou proposta comercial.",
});

const concludeTaskRequestBody = createJsonRequestBody({
  task_id: "task-uuid",
  conclusion_notes: "Documentacao revisada e concluida.",
});

const approveConclusionRequestBody = createJsonRequestBody({
  task_id: "task-uuid",
  approved: true,
  approver_notes: "Conclusao validada pelo responsavel.",
});

const taskIdRequestBody = {
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { task_id: { type: "string" } },
          example: { task_id: "task-uuid" },
        },
      },
    },
  },
} as const;

export function buildTaskServiceOpenApiSpec(env: TaskServiceEnv): OpenApiDocument {
  const baseUrl = `http://localhost:${env.port}`;

  return {
    openapi: "3.0.3",
    info: {
      title: "task-service",
      version: "1.0.0",
      description:
        "Tarefas, modelos, integração Regularize, financeiro e comercial. Endpoints marcados exigem JWT (claims de usuário/organização).",
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "Health", description: "Saúde do serviço" },
      { name: "IntegracaoTasks", description: "CRUD tarefas de integração" },
      { name: "TaskModel", description: "Modelos de tarefa" },
      { name: "TaskDependent", description: "Dependências entre modelos" },
      { name: "TaskIntegration", description: "Vínculos integração Regularize" },
      { name: "Financeiro", description: "Cobrança financeira" },
      { name: "Comercial", description: "Cobrança comercial" },
      { name: "Lifecycle", description: "Conclusão e aprovação" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: "object",
          description: "Resposta de sucesso padrão do workspace",
          additionalProperties: true,
        },
      },
    },
    paths: {
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          responses: {
            "200": { description: "OK", ...successJson },
          },
        },
      },
      "/integracao-tasks": {
        post: {
          tags: ["IntegracaoTasks"],
          summary: "Criar tarefa",
          security: bearer,
          ...createTaskRequestBody,
          responses: { "201": { description: "Criada", ...successJson } },
        },
        get: {
          tags: ["IntegracaoTasks"],
          summary: "Listar tarefas",
          security: bearer,
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "ref", in: "query", schema: { type: "string" } },
            { name: "ref_id", in: "query", schema: { type: "string" } },
            { name: "search", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Lista", ...successJson } },
        },
        put: {
          tags: ["IntegracaoTasks"],
          summary: "Atualizar tarefa",
          security: bearer,
          ...updateTaskRequestBody,
          responses: { "200": { description: "Atualizada", ...successJson } },
        },
      },
      "/integracao-task": {
        get: {
          tags: ["IntegracaoTasks"],
          summary: "Detalhe da tarefa",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          ...taskIdRequestBody,
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        delete: {
          tags: ["IntegracaoTasks"],
          summary: "Excluir tarefa",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          ...taskIdRequestBody,
          responses: { "200": { description: "Excluída", ...successJson } },
        },
      },
      "/integracao-tasksModel": {
        post: {
          tags: ["TaskModel"],
          summary: "Criar modelo de tarefa",
          security: bearer,
          ...createTaskModelRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        get: {
          tags: ["TaskModel"],
          summary: "Listar modelos (type e billing)",
          security: bearer,
          parameters: [
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "billing", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Lista", ...successJson } },
        },
        put: {
          tags: ["TaskModel"],
          summary: "Atualizar modelo",
          security: bearer,
          ...updateTaskModelRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
      },
      "/integracao-taskModel": {
        get: {
          tags: ["TaskModel"],
          summary: "Detalhe do modelo",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Detalhe", ...successJson } },
        },
        delete: {
          tags: ["TaskModel"],
          summary: "Excluir modelo",
          security: bearer,
          parameters: [{ name: "task_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Excluído", ...successJson } },
        },
      },
      "/integracao-tasksModel-dependent": {
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
      },
      "/integracao-taskModel-dependent": {
        delete: {
          tags: ["TaskDependent"],
          summary: "Remover dependente",
          security: bearer,
          parameters: [{ name: "id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Removido", ...successJson } },
        },
      },
      "/integracao-tasksIntegration": {
        post: {
          tags: ["TaskIntegration"],
          summary: "Criar vínculo Regularize",
          security: bearer,
          ...createTaskIntegrationRequestBody,
          responses: { "201": { description: "Criado", ...successJson } },
        },
        delete: {
          tags: ["TaskIntegration"],
          summary: "Remover vínculo",
          security: bearer,
          ...createTaskIntegrationRequestBody,
          responses: { "200": { description: "Removido", ...successJson } },
        },
        get: {
          tags: ["TaskIntegration"],
          summary: "Listar vínculos",
          security: bearer,
          parameters: [{ name: "task_model_id", in: "query", schema: { type: "string" } }],
          responses: { "200": { description: "Lista", ...successJson } },
        },
      },
      "/financeiro-tasks": {
        put: {
          tags: ["Financeiro"],
          summary: "Atualizar cobrança financeira",
          security: bearer,
          ...updateFinanceiroRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
      },
      "/comercial-tasks": {
        put: {
          tags: ["Comercial"],
          summary: "Atualizar cobrança comercial",
          security: bearer,
          ...updateComercialRequestBody,
          responses: { "200": { description: "Atualizado", ...successJson } },
        },
      },
      "/integracao-tasks-conclusion": {
        put: {
          tags: ["Lifecycle"],
          summary: "Concluir tarefa (fluxo de status)",
          security: bearer,
          ...concludeTaskRequestBody,
          responses: { "200": { description: "Concluído", ...successJson } },
        },
      },
      "/integracao-tasks-completeRequest": {
        put: {
          tags: ["Lifecycle"],
          summary: "Aprovar pedido de conclusão",
          security: bearer,
          ...approveConclusionRequestBody,
          responses: { "200": { description: "Aprovado", ...successJson } },
        },
      },
    },
  };
}
