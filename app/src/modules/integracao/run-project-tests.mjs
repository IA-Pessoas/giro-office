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
  buildTaskModelListParams,
  buildUpdateTaskModelPayload,
  normalizeTaskModelResponsibleSequence,
  TASK_MODEL_ENDPOINTS,
  unwrapCreatedTaskModel,
  unwrapTaskModelDetail,
  unwrapTaskModelList,
  unwrapTaskModelOptions,
  unwrapTaskModelPage,
} from "./services/taskModelService.contract.ts";
import {
  buildCreateProjectPayload,
  buildDeleteProjectPayload,
  buildProjectListParams,
  getProjectDeleteErrorMessage,
  PROJECT_DELETE_ADMIN_MESSAGE,
  PROJECT_ENDPOINTS,
  unwrapCreatedProject,
  unwrapProjectDetail,
  unwrapProjectEnvelope,
  unwrapProjectList,
  unwrapProjectMetrics,
  unwrapProjectProgress,
  unwrapUpdatedProject,
} from "./services/projectService.contract.ts";
import { unwrapServiceEnvelope } from "./services/envelope.contract.js";
import {
  TASK_MODEL_CONFIG_ENTRY,
  canManageTaskModelConfig,
  canViewTaskModelConfig,
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
  canEditIntegracaoTask,
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
import { fetchTaskModelsWithOptionalDepartments } from "./hooks/useTaskModels.helpers.ts";
import { projectMetricsQueryKey } from "./hooks/queryKeys.ts";
import { collectAdminUsersFromPages } from "../users/services/adminUsersService.helpers.ts";

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

runTest("task and dependency confirmations retain contextual errors on failure", () => {
  const tasks = readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8");
  const taskModel = readFileSync(
    new URL("./components/TaskModelModal.tsx", import.meta.url),
    "utf8",
  );

  assert.match(tasks, /errorMessage=\{taskDeletionError\}/);
  assert.match(tasks, /setTaskDeletionError\(message\);\s*throw error;/);
  assert.match(taskModel, /errorMessage=\{dependentDeletionError\}/);
  assert.match(taskModel, /setDependentDeletionError\(message\);\s*throw error;/);
});

runTest("integration destructive actions use the shared confirmation dialog", () => {
  const sources = {
    tasks: readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8"),
    taskModel: readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8"),
    projects: readFileSync(
      new URL("./components/ProjectsWorkspace.tsx", import.meta.url),
      "utf8",
    ),
    projectDetail: readFileSync(
      new URL("./components/ProjectDetailView.tsx", import.meta.url),
      "utf8",
    ),
    clientProjects: readFileSync(
      new URL("./components/ClientProjectsSection.tsx", import.meta.url),
      "utf8",
    ),
  };
  const tasksHooksSource = readFileSync(
    new URL("./hooks/useIntegracaoTasks.ts", import.meta.url),
    "utf8",
  );
  const projectsHooksSource = readFileSync(
    new URL("./hooks/useProjects.ts", import.meta.url),
    "utf8",
  );

  for (const source of Object.values(sources)) {
    assert.doesNotMatch(source, /window\s*\.\s*(?:confirm|alert|prompt)\s*\(/);
    assert.match(
      source,
      /import\s*\{[^}]*\bConfirmationDialog\b[^}]*\}\s*from\s*"@shared\/components";/,
    );
    assert.match(source, /<ConfirmationDialog\b/);
  }

  assert.match(sources.tasks, /deleteTaskMutation\.isPending/);
  assert.match(
    sources.tasks,
    /const \[pendingTaskDeletion, setPendingTaskDeletion\] = useState<IntegracaoTaskListItem \| null>\(null\);/,
  );
  assert.match(sources.tasks, /setPendingTaskDeletion\(task\);/);
  assert.match(sources.tasks, /open=\{Boolean\(pendingTaskDeletion\)\}/);
  assert.match(sources.tasks, /onConfirm=\{handleConfirmTaskDeletion\}/);
  assert.match(sources.tasks, /isConfirming=\{deleteTaskMutation\.isPending\}/);
  assert.match(
    sources.tasks,
    /import\s*\{[^}]*\buseDeleteIntegracaoTaskMutation\b[^}]*\}\s*from\s*"\.\.\/hooks";/,
  );
  assert.match(
    sources.tasks,
    /const deleteTaskMutation = useDeleteIntegracaoTaskMutation\(\);/,
  );
  assert.match(sources.tasks, /await deleteTaskMutation\.mutateAsync\(\{\s*taskId:\s*task\.id,?\s*\}\);/);
  assert.match(
    sources.tasks,
    /setVisibleTasks\(\(currentTasks\) =>\s*currentTasks\.filter\(\(currentTask\) => currentTask\.id !== task\.id\),\s*\);/,
  );
  assert.match(sources.tasks, /toast\.success\("Tarefa excluída com sucesso\."\);/);
  assert.match(
    tasksHooksSource,
    /export function useDeleteIntegracaoTaskMutation\(\): UseMutationResult<\s*void,\s*Error,\s*\{ taskId: string \}\s*>\s*\{\s*const queryClient = useQueryClient\(\);\s*return useMutation\(\{\s*mutationFn: \(\{ taskId \}\) => integracaoTasksService\.delete\(taskId\),\s*onSuccess: async \(_result, variables\) => \{\s*queryClient\.removeQueries\(\{\s*queryKey: integracaoTaskDetailQueryKey\(variables\.taskId\),\s*\}\);\s*await queryClient\.invalidateQueries\(\{\s*queryKey: INTEGRACAO_TASKS_QUERY_KEY,\s*\}\);\s*\},\s*\}\);\s*\}/,
  );

  assert.match(sources.taskModel, /loadingDependents/);
  assert.match(
    sources.taskModel,
    /const \[pendingDependentDeletion, setPendingDependentDeletion\] = useState<string \| null>\(null\);/,
  );
  assert.match(sources.taskModel, /setPendingDependentDeletion\(dependent\.id\);/);
  assert.match(sources.taskModel, /open=\{Boolean\(pendingDependentDeletion\)\}/);
  assert.match(sources.taskModel, /onConfirm=\{handleConfirmDependentDeletion\}/);
  assert.match(sources.taskModel, /isConfirming=\{loadingDependents\}/);
  assert.match(sources.taskModel, /await taskModelService\.deleteDependent\(relationId\);/);
  assert.match(sources.taskModel, /toast\.success\("Dependência removida\."\);/);
  assert.match(sources.taskModel, /await refreshDependents\(\);/);

  for (const source of [sources.projects, sources.projectDetail, sources.clientProjects]) {
    assert.match(source, /deleteProjectMutation\.isPending/);
    assert.match(source, /isConfirming=\{deleteProjectMutation\.isPending\}/);
    assert.match(
      source,
      /import\s*\{[^}]*\buseDeleteProjectMutation\b[^}]*\}\s*from\s*"\.\.\/hooks(?:\/useProjects)?";/,
    );
    assert.match(source, /const deleteProjectMutation = useDeleteProjectMutation\(\);/);
    assert.match(source, /toast\.success\("Projeto excluído com sucesso\."\);/);
  }

  assert.match(
    sources.projects,
    /const \[pendingProjectDeletion, setPendingProjectDeletion\] = useState<\{\s*project: ProjectListItem;\s*clientId: string;\s*\} \| null>\(null\);/,
  );
  assert.match(sources.projects, /setPendingProjectDeletion\(\{ project, clientId: selectedClientId \}\);/);
  assert.match(sources.projects, /open=\{Boolean\(pendingProjectDeletion\)\}/);
  assert.match(sources.projects, /onConfirm=\{handleConfirmProjectDeletion\}/);
  assert.match(sources.projects, /errorMessage=\{projectDeletionError\}/);
  assert.match(sources.projects, /setProjectDeletionError\(message\);\s*throw error;/);

  assert.match(sources.projectDetail, /const \[pendingProjectDeletion, setPendingProjectDeletion\]/);
  assert.match(sources.projectDetail, /setPendingProjectDeletion\(project\);/);
  assert.match(sources.projectDetail, /open=\{Boolean\(pendingProjectDeletion\)\}/);
  assert.match(sources.projectDetail, /onConfirm=\{handleConfirmProjectDeletion\}/);
  assert.match(sources.projectDetail, /errorMessage=\{projectDeletionError\}/);
  assert.match(sources.projectDetail, /setProjectDeletionError\(message\);\s*throw error;/);

  assert.match(
    sources.clientProjects,
    /const \[pendingProjectDeletion, setPendingProjectDeletion\] = useState<\{\s*project: ProjectListItem;\s*clientId: string;\s*\} \| null>\(null\);/,
  );
  assert.match(sources.clientProjects, /setPendingProjectDeletion\(\{ project, clientId \}\);/);
  assert.match(sources.clientProjects, /open=\{Boolean\(pendingProjectDeletion\)\}/);
  assert.match(sources.clientProjects, /onConfirm=\{handleConfirmProjectDeletion\}/);
  assert.match(sources.clientProjects, /errorMessage=\{projectDeletionError\}/);
  assert.match(sources.clientProjects, /setProjectDeletionError\(message\);\s*throw error;/);

  assert.match(
    sources.projects,
    /await deleteProjectMutation\.mutateAsync\(\{\s*projectId:\s*project\.id,\s*clientId:\s*pendingClientId,\s*\}\);/,
  );
  assert.match(
    sources.projectDetail,
    /await deleteProjectMutation\.mutateAsync\(\{\s*projectId:\s*project\.id,\s*clientId:\s*project\.client_id,\s*\}\);/,
  );
  assert.match(
    sources.projectDetail,
    /await router\.push\(backClientId \? `\/projects\?clientId=\$\{backClientId\}` : "\/projects"\);/,
  );
  assert.match(
    sources.clientProjects,
    /await deleteProjectMutation\.mutateAsync\(\{\s*projectId:\s*project\.id,\s*clientId:\s*pendingClientId,\s*\}\);/,
  );
  assert.match(
    projectsHooksSource,
    /export function useDeleteProjectMutation\(\): UseMutationResult<\s*void,\s*Error,\s*\{ projectId: string; clientId: string \}\s*>\s*\{\s*const queryClient = useQueryClient\(\);\s*return useMutation\(\{\s*mutationFn: \(\{ projectId \}\) => projectService\.delete\(projectId\),\s*onSuccess: async \(_result, variables\) => \{\s*queryClient\.removeQueries\(\{ queryKey: projectDetailQueryKey\(variables\.projectId\) \}\);\s*await queryClient\.invalidateQueries\(\{\s*queryKey: projectListQueryKey\(\{ ref: "client", id: variables\.clientId \}\),\s*\}\);\s*\},\s*\}\);\s*\}/,
  );
});

runTest("project endpoints use only the v1 project contract", () => {
  assert.equal(PROJECT_ENDPOINTS.list, "/project/list");
  assert.equal(PROJECT_ENDPOINTS.crud, "/project");
  assert.equal(PROJECT_ENDPOINTS.progress, "/project/progress");
  assert.equal(PROJECT_ENDPOINTS.metrics, "/project/metrics");
});

runTest("project metrics query key is stable and global", () => {
  assert.deepEqual(projectMetricsQueryKey(), ["projects", "metrics"]);
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

runTest("project delete actions preserve actionable conflict messages", () => {
  const conflictMessage = "Não é possível excluir projeto com dependências.";

  assert.equal(
    getProjectDeleteErrorMessage({
      response: {
        status: 409,
        data: { error: conflictMessage },
      },
    }),
    conflictMessage,
  );
  assert.equal(
    getProjectDeleteErrorMessage({
      response: {
        status: 403,
        data: { error: "Permissão insuficiente." },
      },
    }),
    PROJECT_DELETE_ADMIN_MESSAGE,
  );

  for (const file of [
    "./components/ProjectsWorkspace.tsx",
    "./components/ProjectDetailView.tsx",
    "./components/ClientProjectsSection.tsx",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /getProjectDeleteErrorMessage/);
    assert.doesNotMatch(source, /toast\.error\("Não foi possível excluir o projeto\."\)/);
  }
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

runTest("unwrapProjectMetrics returns global metrics from envelope", () => {
  const metrics = {
    total: 10,
    completed: 3,
    inProgress: 4,
    paused: 1,
    toDo: 2,
    notContracted: 0,
    taskMetrics: {
      total: 28,
      completed: 12,
      open: 11,
      paused: 3,
      emptyStatus: 2,
    },
  };

  assert.deepEqual(unwrapProjectMetrics({ success: true, data: metrics }), metrics);
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

runTest("buildCreateIntegracaoTaskPayload preserves optional operational details", () => {
  assert.deepEqual(
    buildCreateIntegracaoTaskPayload({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Revisar documentação assinada",
      status: "Em Espera",
      department_id: "department-1",
      observations: "Aguardar o retorno do cliente.",
      billing: "Não Realizar",
      urgency: "Alta",
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      prevision_date: "2026-08-15",
    }),
    {
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      name: "Revisar documentação assinada",
      status: "Em Espera",
      department_id: "department-1",
      observations: "Aguardar o retorno do cliente.",
      billing: "Não Realizar",
      urgency: "Alta",
      responsible_id: "user-1",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      prevision_date: "2026-08-15",
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

runTest("unwrapIntegracaoTaskList preserves global totals and a later-page record", () => {
  const payload = {
    data: [
      {
        id: "task-21",
        name: "Registro 21",
        status: "A Realizar",
        billing: "Não Realizar",
        charge_comercial: false,
        hiring_status: null,
        payment: null,
        billing_description: null,
        charge_financeiro: false,
      },
    ],
    total: 41,
    hasMore: true,
    summary: { inProgress: 9, billable: 14 },
  };
  assert.deepEqual(unwrapIntegracaoTaskList({ success: true, data: payload }), payload);
});

runTest("unwrapIntegracaoTaskDetail extracts nested detail", () => {
  const detail = { id: "t1", name: "Tarefa" };
  assert.deepEqual(unwrapIntegracaoTaskDetail({ success: true, data: { detail } }), detail);
});

runTest("unwrapCreatedIntegracaoTask extracts nested create", () => {
  const created = { id: "t1", name: "Tarefa" };
  assert.deepEqual(
    unwrapCreatedIntegracaoTask({ success: true, data: { create: created } }),
    created,
  );
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
  assert.equal(TASK_MODEL_ENDPOINTS.options, "/task/deps/options");
});

runTest("task model modal uses contextual user selectors", () => {
  const options = {
    users: [{ id: "user-1", name: "Ana" }],
    departments: [{ id: "dep-1", name: "Fiscal" }],
  };

  assert.deepEqual(unwrapTaskModelOptions({ success: true, data: options }), options);
  const source = readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8");
  assert.match(source, /useAssignableUsers/);
  assert.match(source, /module: "integracao"/);
  assert.match(source, /departmentId: formData\.department_id/);
  assert.match(source, /departmentService\.list\(\{ status: "Ativo" \}\)/);
  assert.doesNotMatch(source, /listAdminUsers/);
});

runTest("task edit form loads contextual auxiliary selectors", () => {
  const source = readFileSync(new URL("./components/TaskFormModal.tsx", import.meta.url), "utf8");

  assert.match(source, /useAssignableUsers/);
  assert.match(source, /module: "integracao"/);
  assert.match(source, /departmentId:/);
  assert.match(source, /departmentService\.list\(\{ status: "Ativo" \}\)/);
  assert.doesNotMatch(source, /listAdminUsers/);
});

runTest("task model deletion preserves actionable dependency conflicts", () => {
  const source = readFileSync(new URL("./hooks/useTaskModels.tsx", import.meta.url), "utf8");

  assert.match(source, /response\?\.status === 409/);
  assert.match(source, /response\.data\?\.error \?\? response\.data\?\.message/);
});

runTest("task model list params include remote search and pagination", () => {
  assert.deepEqual(buildTaskModelListParams({ search: " Fiscal ", page: 2, limit: 20 }), {
    search: "Fiscal",
    page: 2,
    limit: 20,
  });
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

runTest("task model responsible sequence clears descendants without their predecessor", () => {
  assert.deepEqual(
    normalizeTaskModelResponsibleSequence({
      responsible_id: "",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
    }),
    {
      responsible_id: "",
      responsible2_id: "",
      responsible3_id: "",
    },
  );
  assert.deepEqual(
    normalizeTaskModelResponsibleSequence({
      responsible_id: "user-1",
      responsible2_id: "",
      responsible3_id: "user-3",
    }),
    {
      responsible_id: "user-1",
      responsible2_id: "",
      responsible3_id: "",
    },
  );
});

runTest("task model payloads omit responsible descendants without their predecessor", () => {
  assert.deepEqual(
    buildCreateTaskModelPayload({
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "",
      responsible2_id: "user-2",
      responsible3_id: "user-3",
      observations: "",
      billing: "Realizar",
      prevision: 5,
      type: "Projeto",
    }),
    {
      name: "Modelo",
      department_id: "dep-1",
      responsible_id: "",
      responsible2_id: null,
      responsible3_id: null,
      observations: null,
      billing: "Realizar",
      prevision: 5,
      type: "Projeto",
    },
  );
});

runTest("task model modal gates dependent responsible controls", () => {
  const source = readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /disabled=\{!formData\.responsible_id \|\| optionsUnavailable\}/,
  );
  assert.match(
    source,
    /disabled=\{!formData\.responsible2_id \|\| optionsUnavailable\}/,
  );
  assert.match(source, /Selecione o responsável antes de definir o responsável 2\./);
  assert.match(source, /Selecione o responsável 2 antes de definir o responsável 3\./);
});

runTest("task model modal allows retrying failed options before saving", () => {
  const source = readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8");

  assert.match(source, /const \[optionsRetryKey, setOptionsRetryKey\] = useState\(0\)/);
  assert.match(source, /const \[requiredOptionsWarning, setRequiredOptionsWarning\] = useState\(false\)/);
  assert.match(source, /const \[taskModelsWarning, setTaskModelsWarning\] = useState\(false\)/);
  assert.match(source, /onClick=\{\(\) => setOptionsRetryKey\(\(currentKey\) => currentKey \+ 1\)\}/);
  assert.match(source, />\s*Tentar novamente\s*<\/button>/);
  assert.match(source, /const optionsUnavailable =/);
  assert.match(source, /requiredOptionsWarning/);
  assert.match(source, /usersQuery\.isLoading/);
  assert.match(source, /usersQuery\.isError/);
  assert.match(source, /const taskModelsUnavailable = loadingOptions \|\| taskModelsWarning;/);
  assert.match(source, /const saveDisabled =[\s\S]*optionsUnavailable;/);
  assert.match(source, /disabled=\{taskModelsUnavailable\}/);
});

runTest("buildDeleteTaskModelPayload maps task_id body", () => {
  assert.deepEqual(buildDeleteTaskModelPayload("model-1"), { task_id: "model-1" });
});

runTest("unwrapTaskModelList returns array from envelope", () => {
  const payload = [{ id: "model-1", name: "Modelo", department_id: "dep-1" }];
  assert.deepEqual(unwrapTaskModelList({ success: true, data: payload }), payload);
});

runTest("unwrapTaskModelPage preserves later-page metadata", () => {
  const payload = {
    data: [{ id: "model-21", name: "Fiscal 21", department_id: "dep-1" }],
    total: 21,
    page: 2,
    limit: 20,
    hasMore: false,
  };
  assert.deepEqual(
    unwrapTaskModelPage({ success: true, data: payload }, { page: 2, limit: 20 }),
    payload,
  );
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
  assert.equal(canManageTaskModelConfig({ isAdmin: false }), false);
  assert.equal(canManageTaskModelConfig({ isAdmin: true }), true);
  assert.equal(canViewTaskModelConfig(null), false);
  assert.equal(canViewTaskModelConfig({ canView: false }), false);
  assert.equal(canViewTaskModelConfig({ canView: true }), true);
});

runTest("integration write actions use the modular access level", () => {
  const tasksSource = readFileSync(
    new URL("./components/TasksWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const taskFormSource = readFileSync(
    new URL("./components/TaskFormModal.tsx", import.meta.url),
    "utf8",
  );
  const projectsSource = readFileSync(
    new URL("./components/ProjectsWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const clientsSource = readFileSync(
    new URL("../../shared/components/newLayout/Clients.tsx", import.meta.url),
    "utf8",
  );
  const configSource = readFileSync(
    new URL("../../pages/configs/integracao/tasks/index.tsx", import.meta.url),
    "utf8",
  );

  assert.match(tasksSource, /const canCreate = integracaoAccess\.canEdit;/);
  assert.match(tasksSource, /const canManageTaskModels = integracaoAccess\.isAdmin;/);
  assert.match(tasksSource, /canEditIntegracaoTask\(integracaoAccess, task\)/);
  assert.match(taskFormSource, /const isRestrictedEdit =/);
  assert.match(taskFormSource, /enabled: open && !isRestrictedEdit/);
  assert.match(taskFormSource, /module: "integracao"/);
  assert.match(taskFormSource, /departmentId:/);
  assert.match(taskFormSource, /task_id: taskId,\s*status,\s*observations/);
  assert.match(taskFormSource, /hasRestrictedTaskAccessDenied/);
  assert.match(projectsSource, /const canEdit = integracaoAccess\.canEdit;/);
  assert.match(clientsSource, /useModuleAccess\("integracao"\)/);
  assert.match(clientsSource, /const canCreateClient = integracaoAccess\.canEdit;/);
  assert.match(configSource, /useModuleAccess\("integracao"\)/);
  assert.match(configSource, /canManageTaskModelConfig\(integracaoAccess\)/);
});

runTest("task model config links back to the tasks workspace", () => {
  const source = readFileSync(
    new URL("../../pages/configs/integracao/tasks/index.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes('import Link from "next/link";'), true);
  assert.equal(source.includes("ArrowLeft"), true);
  assert.equal(source.includes('href="/tasks"'), true);
  assert.equal(source.includes("Voltar para tarefas"), true);
});

runTest("issue 495 project task observations preserve line breaks and wrap long tokens", () => {
  const source = readFileSync(
    new URL("./components/ProjectDetailView.tsx", import.meta.url),
    "utf8",
  );
  const observationsDisplay =
    source.match(
      /<p className="[^"]*">\s*\{task\.observations \|\| task\.observation \|\| "Sem observações específicas\."\}\s*<\/p>/,
    )?.[0] ?? "";

  assert.match(observationsDisplay, /whitespace-pre-wrap/);
  assert.match(observationsDisplay, /break-words/);
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

runTest("tasks delete permission follows integration module admin level", () => {
  const source = readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8");

  assert.equal(source.includes('import { useModuleAccess } from "@modules/auth";'), true);
  assert.equal(source.includes("const canDelete = integracaoAccess.isAdmin;"), true);
  assert.equal(source.includes("const canDelete = meQuery.data?.permission === 2;"), false);
});

runTest("task list hides restricted edit actions from non-responsible users", () => {
  assert.equal(canEditIntegracaoTask({ level: "view" }, { isOwn: true }), true);
  assert.equal(canEditIntegracaoTask({ level: "view" }, { isOwn: false }), false);
  assert.equal(canEditIntegracaoTask({ level: "edit" }, { isOwn: false }), true);
  assert.equal(canEditIntegracaoTask({ level: "admin" }, { isOwn: false }), true);
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

runTest("tasks table uses shorter width and the shared system scrollbar", () => {
  assert.equal(TASK_TABLE_CLASSNAME.includes("1320px"), false);
  assert.equal(TASK_TABLE_CLASSNAME.includes("1120px"), true);
  assert.equal(TASK_TABLE_SCROLL_AREA_CLASSNAME.includes("overflow-x-auto"), true);
  assert.equal(TASK_TABLE_SCROLL_AREA_CLASSNAME.includes("u-scrollbar-system"), true);
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

runTest("task create validation accepts blank observations before submit", () => {
  const validValues = {
    clientId: "client-1",
    projectId: "project-1",
    modelId: "model-1",
    prospectingStatus: "Fechado",
    urgency: "Normal",
    observations: "Detalhes da tarefa",
  };

  assert.equal(getTaskCreateValidationMessage(validValues), null);
  assert.equal(getTaskCreateValidationMessage({ ...validValues, observations: "   " }), null);
});

runTest("task create form marks observations as optional", () => {
  const source = readFileSync("src/modules/integracao/components/TaskFormModal.tsx", "utf8");
  const observationsField = source.match(
    /<textarea\s+value=\{createValues\.observations\}[\s\S]*?\/>/,
  )?.[0];

  assert.ok(observationsField, "create observations textarea not found");
  assert.doesNotMatch(observationsField, /\srequired(?:\s|>|$)/);
});

runTest("task create OpenAPI contract keeps observations optional", () => {
  const source = readFileSync("../services/task-service/src/openapi/spec.ts", "utf8");
  const createTaskRequired = source.match(
    /const createTaskRequestBody = createObjectRequestBody\(\{[\s\S]*?required: \[([\s\S]*?)\]/,
  )?.[1];

  assert.ok(createTaskRequired, "create task required list not found");
  assert.doesNotMatch(createTaskRequired, /"observations"/);
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
  assert.equal(
    getTaskModelDepartmentLabel({ department_id: "dep-1" }),
    "Departamento não carregado",
  );
});

runTest("task model config table locks visible column alignment", () => {
  assert.equal(TASK_MODEL_TABLE_CLASSNAME.includes("table-fixed"), true);
  assert.equal(TASK_MODEL_TABLE_HEADER_ROW_CLASSNAME, "text-left");
  assert.equal(TASK_MODEL_TABLE_MODEL_COLUMN_CLASSNAME, "w-[52%]");
  assert.equal(TASK_MODEL_TABLE_DEPARTMENT_COLUMN_CLASSNAME, "w-[32%]");
  assert.equal(TASK_MODEL_TABLE_ACTION_COLUMN_CLASSNAME, "w-24");
});

runTest("task model config delegates search and pagination to the server", () => {
  const source = readFileSync("src/pages/configs/integracao/tasks/index.tsx", "utf8");

  assert.match(source, /useDebouncedValue\(searchTerm\.trim\(\), 300\)/);
  assert.match(source, /<PaginationControls/);
  assert.doesNotMatch(source, /filteredModels/);
});

await runAsyncTest(
  "active users for task selects are loaded without unsupported user query params",
  async () => {
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
    assert.deepEqual(
      users.map((user) => user.id),
      ["user-active"],
    );
  },
);

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

runTest(
  "integration client selection lives in workspace headers and forms show the selected client",
  () => {
    const projects = readFileSync(
      "src/modules/integracao/components/ProjectsWorkspace.tsx",
      "utf8",
    );
    const tasks = readFileSync("src/modules/integracao/components/TasksWorkspace.tsx", "utf8");
    const taskForm = readFileSync("src/modules/integracao/components/TaskFormModal.tsx", "utf8");

    assert.match(projects, /ClientPickerModal/);
    assert.match(
      projects,
      /<header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">/,
    );
    assert.match(tasks, /ClientPickerModal/);
    assert.match(tasks, /disabled=\{!selectedClient\}/);
    assert.match(taskForm, /ClientSelectionField/);
    assert.doesNotMatch(taskForm, /<ClientPickerModal/);
    assert.doesNotMatch(projects, /useClients\(/);
    assert.doesNotMatch(tasks, /useClients\(/);
    assert.doesNotMatch(projects, /page:\s*1/);
    assert.doesNotMatch(tasks, /page:\s*1/);
  },
);
runTest("project and task model forms disclose their required fields", () => {
  const projectForm = readFileSync("src/modules/integracao/components/ProjectFormModal.tsx", "utf8");
  const taskModelForm = readFileSync("src/modules/integracao/components/TaskModelModal.tsx", "utf8");

  for (const source of [projectForm, taskModelForm]) {
    assert.match(source, /RequiredFieldLabel/);
    assert.match(source, /aria-required/);
  }
});

runTest("project date fields handle native input events", () => {
  const projectForm = readFileSync("src/modules/integracao/components/ProjectFormModal.tsx", "utf8");

  assert.equal(
    (projectForm.match(/onInput=\{\(event\) => updateValue\("start_date", event\.currentTarget\.value\)\}/g) ?? [])
      .length,
    1,
  );
  assert.equal(
    (projectForm.match(/onInput=\{\(event\) => updateValue\("end_date", event\.currentTarget\.value\)\}/g) ?? [])
      .length,
    1,
  );
});
