import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
  buildCreateTaskModelPayload,
  buildDeleteTaskModelPayload,
  buildUpdateTaskModelPayload,
  TASK_MODEL_ENDPOINTS,
  unwrapCreatedTaskModel,
  unwrapTaskModelDetail,
  unwrapTaskModelList,
} from "./services/taskModelService.contract.ts";
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
import { unwrapServiceEnvelope } from "./services/envelope.contract.js";
import {
  TASK_MODEL_CONFIG_ENTRY,
  canManageTaskModelConfig,
} from "./navigation/taskModelConfigNavigation.ts";
import {
  TASK_TABLE_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_ACTION_CELL_CLASSNAME,
  TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME,
  TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME,
  TASK_TABLE_CLASSNAME,
  TASK_TABLE_NAME_CELL_CLASSNAME,
  TASK_TABLE_NAME_HEAD_CELL_CLASSNAME,
  TASK_TABLE_SCROLL_AREA_CLASSNAME,
  formatTasksFooterSummary,
} from "./components/taskWorkspaceUi.ts";
import {
  TASK_FORM_BODY_CLASSNAME,
  TASK_FORM_CONTENT_CLASSNAME,
  TASK_FORM_FORM_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_TEXTAREA_CLASSNAME,
  TASK_URGENCY_OPTIONS,
  getDefaultTaskUrgency,
  getTaskCreateValidationMessage,
  getProjectSelectPlaceholder,
  getTaskUrgencyOptions,
  isTaskUrgency,
  shouldBlockTaskEditForm,
} from "./components/taskFormModalUi.ts";
import {
  TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME,
  TASK_MODEL_TABLE_CLASSNAME,
  TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME,
  TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME,
  TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME,
  getTaskModelDepartmentLabel,
  getTaskModelEmptyStateMessage,
} from "./components/taskModelConfigUi.ts";
import {
  fetchTaskModelsWithOptionalDepartments,
} from "./hooks/useTaskModels.helpers.ts";
import {
  collectAdminUsersFromPages,
} from "../users/services/adminUsersService.helpers.ts";

function runTest(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
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

runTest("unwrapServiceEnvelope handles shared service envelopes", () => {
  const payload = { id: "task-1", name: "Tarefa" };

  assert.deepEqual(unwrapServiceEnvelope({ success: true, data: payload }), payload);
  assert.deepEqual(unwrapServiceEnvelope(payload), payload);
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

runTest("task model endpoints match task-service contract", () => {
  assert.equal(TASK_MODEL_ENDPOINTS.crud, "/task/model");
  assert.equal(TASK_MODEL_ENDPOINTS.list, "/task/model/list");
  assert.equal(TASK_MODEL_ENDPOINTS.dependent, "/task/model/dependent");
});

runTest("buildUpdateTaskModelPayload maps id to task_id", () => {
  assert.deepEqual(
    buildUpdateTaskModelPayload({
      id: "model-1",
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: "",
      responsible3_id: "",
      observations: "",
      billing: "Não Realizar",
      prevision: 3,
      type: "Projeto",
    }),
    {
      task_id: "model-1",
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      observations: null,
      billing: "Não Realizar",
      prevision: 3,
      type: "Projeto",
    },
  );
});

runTest("buildCreateTaskModelPayload maps nullable fields", () => {
  assert.deepEqual(
    buildCreateTaskModelPayload({
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: "",
      responsible3_id: "",
      observations: "",
      billing: "Realizar",
      prevision: 5,
      type: "Projeto",
    }),
    {
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "user-1",
      responsible2_id: null,
      responsible3_id: null,
      observations: null,
      billing: "Realizar",
      prevision: 5,
      type: "Projeto",
    },
  );
});

runTest("buildDeleteTaskModelPayload maps task_id body", () => {
  assert.deepEqual(buildDeleteTaskModelPayload("model-1"), { task_id: "model-1" });
});

runTest("unwrapTaskModelList returns array from envelope", () => {
  const payload = [{ id: "model-1", name: "Modelo", department_id: "dep-1" }];
  assert.deepEqual(unwrapTaskModelList({ success: true, data: payload }), payload);
});

runTest("unwrapTaskModelDetail extracts nested detail", () => {
  const detail = { id: "model-1", name: "Modelo" };
  assert.deepEqual(unwrapTaskModelDetail({ success: true, data: { detail } }), detail);
});

runTest("unwrapCreatedTaskModel extracts nested create", () => {
  const created = { id: "model-1", name: "Modelo" };
  assert.deepEqual(unwrapCreatedTaskModel({ success: true, data: { create: created } }), created);
});

runTest("task model config entry is discoverable in product workflows", () => {
  assert.equal(TASK_MODEL_CONFIG_ENTRY.href, "/configs/integracao/tasks");
  assert.equal(TASK_MODEL_CONFIG_ENTRY.label, "Modelos de tarefas");
  assert.equal(TASK_MODEL_CONFIG_ENTRY.shortLabel, "Modelos");
  assert.equal(canManageTaskModelConfig(null), false);
  assert.equal(canManageTaskModelConfig(1), false);
  assert.equal(canManageTaskModelConfig(2), true);
  assert.equal(canManageTaskModelConfig(3), true);
});

runTest("tasks footer summary uses natural Portuguese copy", () => {
  assert.equal(formatTasksFooterSummary({ page: 1, count: 0 }), "Nenhuma tarefa carregada.");
  assert.equal(formatTasksFooterSummary({ page: 1, count: 1 }), "1 tarefa carregada.");
  assert.equal(formatTasksFooterSummary({ page: 2, count: 4 }), "4 tarefas carregadas.");
});

runTest("tasks table actions use inline square icon buttons", () => {
  assert.equal(TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME.includes("sticky"), false);
  assert.equal(TASK_TABLE_ACTION_HEAD_CELL_CLASSNAME.includes("right-0"), false);
  assert.equal(TASK_TABLE_ACTION_CELL_CLASSNAME.includes("sticky"), false);
  assert.equal(TASK_TABLE_ACTION_CELL_CLASSNAME.includes("right-0"), false);
  assert.equal(TASK_TABLE_ACTION_BUTTON_CLASSNAME.includes("h-9"), true);
  assert.equal(TASK_TABLE_ACTION_BUTTON_CLASSNAME.includes("w-9"), true);
  assert.equal(TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME.includes("h-9"), true);
  assert.equal(TASK_TABLE_DANGER_ACTION_BUTTON_CLASSNAME.includes("w-9"), true);
});

runTest("tasks delete permission follows shared admin helper", () => {
  const source = readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('import { isAdminPermission } from "@modules/auth";'), true);
  assert.equal(
    source.includes("const canDelete = isAdminPermission(meQuery.data?.permission);"),
    true,
  );
  assert.equal(source.includes("const canDelete = meQuery.data?.permission === 2;"), false);
});

runTest("task form modal uses compact layout classes", () => {
  assert.equal(TASK_FORM_CONTENT_CLASSNAME.includes("760px"), true);
  assert.equal(TASK_FORM_CONTENT_CLASSNAME.includes("820px"), false);
  assert.equal(TASK_FORM_BODY_CLASSNAME.includes("max-h-[64vh]"), true);
  assert.equal(TASK_FORM_BODY_CLASSNAME.includes("!py-3"), true);
  assert.equal(TASK_FORM_FORM_CLASSNAME, "space-y-3");
  assert.equal(TASK_FORM_GRID_CLASSNAME, "grid gap-3 md:grid-cols-2");
  assert.equal(TASK_FORM_TEXTAREA_CLASSNAME.includes("min-h-20"), true);
});

runTest("project select placeholder keeps empty state inside the control", () => {
  assert.equal(
    getProjectSelectPlaceholder({ hasClient: false, isLoading: false, projectCount: null }),
    "Selecione o cliente primeiro",
  );
  assert.equal(
    getProjectSelectPlaceholder({ hasClient: true, isLoading: true, projectCount: null }),
    "Carregando projetos...",
  );
  assert.equal(
    getProjectSelectPlaceholder({ hasClient: true, isLoading: false, projectCount: 0 }),
    "Nenhum projeto para este cliente",
  );
  assert.equal(
    getProjectSelectPlaceholder({ hasClient: true, isLoading: false, projectCount: 2 }),
    "Selecione um projeto",
  );
});

runTest("tasks table uses shorter width and thin horizontal scrollbar", () => {
  assert.equal(TASK_TABLE_CLASSNAME.includes("1320px"), false);
  assert.equal(TASK_TABLE_CLASSNAME.includes("1120px"), true);
  assert.equal(TASK_TABLE_SCROLL_AREA_CLASSNAME.includes("overflow-x-auto"), true);
  assert.equal(TASK_TABLE_SCROLL_AREA_CLASSNAME.includes("h-1.5"), true);
});

runTest("tasks table gives the task name column more breathing room", () => {
  assert.equal(TASK_TABLE_NAME_HEAD_CELL_CLASSNAME.includes("w-44"), true);
  assert.equal(TASK_TABLE_NAME_HEAD_CELL_CLASSNAME.includes("pl-5"), true);
  assert.equal(TASK_TABLE_NAME_CELL_CLASSNAME.includes("pl-5"), true);
});

runTest("task urgency uses a constrained selectable set", () => {
  assert.deepEqual(TASK_URGENCY_OPTIONS, ["Baixa", "Normal", "Alta", "Urgente"]);
  assert.equal(getDefaultTaskUrgency(), "Normal");
  assert.equal(isTaskUrgency("Alta"), true);
  assert.equal(isTaskUrgency("Crítica"), false);
  assert.deepEqual(getTaskUrgencyOptions("Fora do padrão"), [
    "Fora do padrão",
    "Baixa",
    "Normal",
    "Alta",
    "Urgente",
  ]);
});

runTest("task edit form only blocks while the task detail is loading", () => {
  assert.equal(
    shouldBlockTaskEditForm({
      isTaskLoading: true,
      isDepartmentsLoading: false,
      isUsersLoading: false,
    }),
    true,
  );
  assert.equal(
    shouldBlockTaskEditForm({
      isTaskLoading: false,
      isDepartmentsLoading: true,
      isUsersLoading: true,
    }),
    false,
  );
});

runTest("task create validation requires observations before submit", () => {
  const validValues = {
    clientId: "client-1",
    projectId: "project-1",
    modelId: "model-1",
    prospectingStatus: "Fechado",
    urgency: "Normal",
    observations: "Detalhes da tarefa",
  };

  assert.equal(getTaskCreateValidationMessage(validValues), null);
  assert.equal(
    getTaskCreateValidationMessage({ ...validValues, observations: "   " }),
    "Preencha as observações da tarefa.",
  );
});

runTest("task model config uses clear empty and department fallback copy", () => {
  assert.equal(
    getTaskModelEmptyStateMessage({ hasSearch: true, isError: false }),
    "Nenhum modelo encontrado para a busca.",
  );
  assert.equal(
    getTaskModelEmptyStateMessage({ hasSearch: false, isError: true }),
    "Não foi possível carregar os modelos.",
  );
  assert.equal(getTaskModelDepartmentLabel({ department: { name: "Fiscal" } }), "Fiscal");
  assert.equal(getTaskModelDepartmentLabel({ department_id: "dep-1" }), "Departamento não carregado");
});

runTest("task model config table locks visible column alignment", () => {
  assert.equal(TASK_MODEL_TABLE_CLASSNAME.includes("table-fixed"), true);
  assert.equal(TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME, "text-left");
  assert.equal(TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME, "w-[52%]");
  assert.equal(TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME, "w-[32%]");
  assert.equal(TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME, "w-24");
});

await runAsyncTest("active users for task selects are loaded without unsupported user query params", async () => {
  const calls = [];
  const users = await collectAdminUsersFromPages({
    status: "active",
    listPage: async (params) => {
      calls.push(params);
      return {
        users: [
          {
            id: "user-active",
            name: "Usuario ativo",
            login: "ativo",
            permission: 1,
            department_id: "dep-1",
            status: "active",
          },
          {
            id: "user-inactive",
            name: "Usuario inativo",
            login: "inativo",
            permission: 1,
            department_id: "dep-1",
            status: "inactive",
          },
        ],
        total: 2,
        skip: 0,
        take: 100,
      };
    },
  });

  assert.deepEqual(calls, [{ skip: 0, take: 100 }]);
  assert.deepEqual(users.map((user) => user.id), ["user-active"]);
});

await runAsyncTest("task models still load when department enrichment fails", async () => {
  let capturedError = null;
  const models = await fetchTaskModelsWithOptionalDepartments({
    listModels: async () => [
      {
        id: "model-1",
        name: "Revisar documentos",
        department_id: "dep-1",
      },
    ],
    listDepartments: async () => {
      throw new Error("department service unavailable");
    },
    onDepartmentError: (error) => {
      capturedError = error;
    },
  });

  assert.equal(models.length, 1);
  assert.equal(models[0].name, "Revisar documentos");
  assert.equal(models[0].department, undefined);
  assert.equal(capturedError instanceof Error, true);
});
