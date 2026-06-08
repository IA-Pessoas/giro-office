import assert from "node:assert/strict";

import {
  buildCreateIntegracaoTaskPayload,
  buildDeleteIntegracaoTaskPayload,
  buildIntegracaoTaskListParams,
  buildUpdateIntegracaoTaskPayload,
  INTEGRACAO_TASKS_ENDPOINTS,
  unwrapCreatedIntegracaoTask,
  unwrapIntegracaoTaskDetail,
  unwrapIntegracaoTaskList,
  unwrapUpdatedIntegracaoTask,
} from "./services/integracaoTasksService.contract.ts";
import {
  buildCreateProjectPayload,
  buildDeleteProjectPayload,
  buildProjectListParams,
  PROJECT_ENDPOINTS,
  unwrapCreatedProject,
  unwrapProjectDetail,
  unwrapProjectEnvelope,
  unwrapProjectList,
  unwrapProjectProgress,
  unwrapUpdatedProject,
} from "./services/projectService.contract.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

runTest("project endpoints use only the v1 project contract", () => {
  assert.equal(PROJECT_ENDPOINTS.list, "/project/list");
  assert.equal(PROJECT_ENDPOINTS.crud, "/project");
  assert.equal(PROJECT_ENDPOINTS.progress, "/project/progress");
});

runTest("buildProjectListParams keeps strict client-scoped params", () => {
  assert.deepEqual(buildProjectListParams({ ref: "client", id: "client-1" }), {
    ref: "client",
    id: "client-1",
  });
});

runTest("buildCreateProjectPayload omits end_date when absent", () => {
  assert.deepEqual(
    buildCreateProjectPayload({
      client_id: "client-1",
      name: "Projeto XPTO",
      start_date: "2026-06-03",
      objective: "Organizar onboarding",
    }),
    {
      client_id: "client-1",
      name: "Projeto XPTO",
      start_date: "2026-06-03",
      objective: "Organizar onboarding",
    },
  );
});

runTest("buildDeleteProjectPayload maps project_id body", () => {
  assert.deepEqual(buildDeleteProjectPayload("project-1"), { project_id: "project-1" });
});

runTest("unwrapProjectEnvelope handles top-level data wrapper", () => {
  const payload = [{ id: "project-1", name: "Projeto 1" }];
  assert.deepEqual(unwrapProjectEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapProjectEnvelope(payload), payload);
});

runTest("unwrapProjectList returns the data array from list envelope", () => {
  const payload = [{ id: "project-1", name: "Projeto 1" }];
  assert.deepEqual(unwrapProjectList({ success: true, data: payload }), payload);
});

runTest("unwrapCreatedProject extracts nested create envelope", () => {
  const project = { id: "project-1", name: "Projeto 1" };
  assert.deepEqual(unwrapCreatedProject({ success: true, data: { create: project } }), project);
});

runTest("unwrapProjectDetail extracts nested detail envelope", () => {
  const detail = { id: "project-1", name: "Projeto 1", tasks: [] };
  assert.deepEqual(unwrapProjectDetail({ success: true, data: { detail } }), detail);
});

runTest("unwrapUpdatedProject accepts direct object payload", () => {
  const project = { id: "project-1", name: "Projeto 1 atualizado" };
  assert.deepEqual(unwrapUpdatedProject(project), project);
  assert.deepEqual(unwrapUpdatedProject({ success: true, data: project }), project);
});

runTest("unwrapProjectProgress extracts nested project envelope", () => {
  const progress = { porcentage: 64, status: "Em andamento" };
  assert.deepEqual(unwrapProjectProgress({ success: true, data: { project: progress } }), progress);
});

runTest("integracao tasks endpoints match task-service contract", () => {
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.crud, "/task");
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.list, "/task/list");
});

runTest("buildIntegracaoTaskListParams passes query fields literally", () => {
  assert.deepEqual(
    buildIntegracaoTaskListParams({
      status: "Em Andamento",
      ref: "CobrançaComercial",
      ref_id: "",
      search: "onboarding",
      page: 2,
      limit: 50,
    }),
    {
      status: "Em Andamento",
      ref: "CobrançaComercial",
      ref_id: "",
      search: "onboarding",
      page: 2,
      limit: 50,
    },
  );
});

runTest("buildCreateIntegracaoTaskPayload maps create body", () => {
  assert.deepEqual(
    buildCreateIntegracaoTaskPayload({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      urgency: "Alta",
    }),
    {
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      observations: "",
      urgency: "Alta",
    },
  );
});

runTest("buildUpdateIntegracaoTaskPayload keeps task_id", () => {
  assert.deepEqual(
    buildUpdateIntegracaoTaskPayload({
      task_id: "task-1",
      status: "Paralisado",
    }),
    { task_id: "task-1", status: "Paralisado" },
  );
});

runTest("buildDeleteIntegracaoTaskPayload maps task_id body", () => {
  assert.deepEqual(buildDeleteIntegracaoTaskPayload("task-1"), { task_id: "task-1" });
});

runTest("unwrapIntegracaoTaskList extracts data and hasMore", () => {
  const payload = {
    data: [
      {
        id: "t1",
        name: "Tarefa",
        status: "A Realizar",
        billing: "Não Realizar",
        charge_comercial: false,
        hiring_status: null,
        payment: null,
        billing_description: null,
        charge_financeiro: false,
      },
    ],
    hasMore: true,
  };
  assert.deepEqual(unwrapIntegracaoTaskList({ success: true, data: payload }), payload);
});

runTest("unwrapIntegracaoTaskDetail extracts nested detail", () => {
  const detail = { id: "t1", name: "Tarefa" };
  assert.deepEqual(unwrapIntegracaoTaskDetail({ success: true, data: { detail } }), detail);
});

runTest("unwrapCreatedIntegracaoTask extracts nested create", () => {
  const created = { id: "t1", name: "Tarefa" };
  assert.deepEqual(unwrapCreatedIntegracaoTask({ success: true, data: { create: created } }), created);
});

runTest("unwrapUpdatedIntegracaoTask accepts direct object payload", () => {
  const updated = { id: "t1", name: "Tarefa atualizada" };
  assert.deepEqual(unwrapUpdatedIntegracaoTask(updated), updated);
  assert.deepEqual(unwrapUpdatedIntegracaoTask({ success: true, data: updated }), updated);
});
