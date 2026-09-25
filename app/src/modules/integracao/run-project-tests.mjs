import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as taskFormUi from "./components/taskFormModalUi.ts";
import { isServerErrorAlreadyNotified } from "../../shared/services/serverErrorToast.ts";

runTest("task edit accepts an unassigned task while retaining required operational fields", () => {
  assert.equal(typeof taskFormUi.getTaskEditValidationMessage, "function");
  const values = { name: "Tarefa", status: "Em Andamento", department_id: "dep-1", model_id: "model-1", urgency: "Alta", responsible_id: "" };
  assert.equal(taskFormUi.getTaskEditValidationMessage(values), null);
  for (const field of ["name", "status", "department_id", "model_id", "urgency"]) {
    assert.ok(taskFormUi.getTaskEditValidationMessage({ ...values, [field]: "" }));
  }
});

runTest("task edit sends actual null for an empty responsible select and preserves omission", () => {
  assert.deepEqual(buildUpdateIntegracaoTaskPayload({ task_id: "task-1", responsible_id: "" }), { task_id: "task-1", responsible_id: null });
  assert.deepEqual(buildUpdateIntegracaoTaskPayload({ task_id: "task-1", observations: "obs" }), { task_id: "task-1", observations: "obs" });
});

runTest("task creation preserves explicit null responsible and omits secondary assignments", () => {
  const base = { model_id: "model-1", project_id: "project-1", client_id: "client-1", prospecting_status: "Fechado", department_id: "department-1", urgency: "Alta" };
  assert.deepEqual(buildCreateIntegracaoTaskPayload({ ...base, responsible_id: null }), { ...base, observations: "", responsible_id: null });
  assert.equal(Object.hasOwn(buildCreateIntegracaoTaskPayload(base), "responsible_id"), false);
});

runTest("task completion contract preserves request, decision, reopen and history payloads", () => {
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.completionRequest, "/task/complete-request");
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.completionRequestList, "/task/complete-request/list");
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.reopen, "/task/reopen");
  assert.deepEqual(buildTaskCompletionRequestPayload("task-1", "Pronta para validação."), {
    task_id: "task-1",
    reason: "Pronta para validação.",
  });
  assert.deepEqual(buildTaskCompletionDecisionPayload("task-1", "request-1", "refused", "Falta anexo."), {
    task_id: "task-1",
    request_id: "request-1",
    decision: "refused",
    reason: "Falta anexo.",
  });
  assert.deepEqual(buildTaskReopenPayload("task-1", "Documento pendente."), {
    task_id: "task-1",
    reason: "Documento pendente.",
  });
  assert.deepEqual(
    unwrapTaskCompletionRequestHistory({ success: true, data: [{ id: "request-1", status: "pending" }] }),
    [{ id: "request-1", status: "pending" }],
  );
});

runTest("task completion panel exposes request, decision, cancel, history and reopen actions", () => {
  const source = readFileSync(
    new URL("./components/TaskCompletionPanel.tsx", import.meta.url),
    "utf8",
  );
  for (const hook of [
    "useRequestTaskCompletionMutation",
    "useDecideTaskCompletionMutation",
    "useCancelTaskCompletionMutation",
    "useReopenTaskMutation",
    "useIntegracaoTaskCompletionRequests",
  ]) {
    assert.match(source, new RegExp(hook));
  }
  assert.match(source, /Solicitar conclusão/);
  assert.match(source, /Recusar/);
  assert.match(source, /Cancelar solicitação/);
  assert.match(source, /Reabrir tarefa/);
});

runTest("task attachment contract keeps private paths out of the UI", () => {
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.attachment, "/task/attachment");
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.attachmentAccess, "/task/attachment/access");
  assert.deepEqual(
    unwrapTaskAttachmentList({ success: true, data: [{ id: "attachment-1" }] }),
    [{ id: "attachment-1" }],
  );
  assert.equal(
    unwrapTaskAttachmentAccessUrl({ success: true, data: { url: "https://signed.example/file" } }),
    "https://signed.example/file",
  );
  const source = readFileSync(new URL("./components/TaskAttachmentPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /useUploadTaskAttachmentMutation/);
  assert.match(source, /useIntegracaoTaskAttachments/);
  assert.match(source, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
  assert.match(source, /key=\{fileInputKey\}/);
  assert.doesNotMatch(source, /object_path/);
});

runTest("task attachment calls skip the global 5xx toast", () => {
  const service = readFileSync(
    new URL("./services/integracaoTasksService.ts", import.meta.url),
    "utf8",
  );
  for (const method of [
    "uploadAttachment",
    "listAttachments",
    "getAttachmentAccessUrl",
    "deleteAttachment",
  ]) {
    const body = service.slice(service.indexOf(`async ${method}(`)).split("\n  },")[0];
    assert.match(body, /attachmentApi\(\)/, method);
    assert.doesNotMatch(body, /setupAPIClient\(/, method);
  }
  assert.match(
    service,
    /function attachmentApi\(\) \{\n\s*return setupAPIClient\([^)]*notifyServerErrors: false/,
  );
});

runTest("task postponement contract and panel retain justification and chronological history", () => {
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.postponement, "/task/postponement");
  assert.equal(INTEGRACAO_TASKS_ENDPOINTS.postponementList, "/task/postponement/list");
  assert.deepEqual(
    buildTaskPostponementPayload("task-1", "2026-09-20", "Aguardando documento."),
    {
      task_id: "task-1",
      new_prevision_date: "2026-09-20",
      justification: "Aguardando documento.",
    },
  );
  assert.deepEqual(
    unwrapTaskPostponementHistory({ success: true, data: [{ id: "postponement-1" }] }),
    [{ id: "postponement-1" }],
  );
  const panel = readFileSync(
    new URL("./components/TaskPostponementPanel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(panel, /usePostponeTaskMutation/);
  assert.match(panel, /useIntegracaoTaskPostponements/);
  assert.match(panel, /Justificativa da prorrogação/);
  assert.match(panel, /Histórico de prorrogações/);
});

import {
  buildCreateIntegracaoTaskPayload,
  buildDeleteIntegracaoTaskPayload,
  buildIntegracaoTaskListParams,
  buildTaskCompletionDecisionPayload,
  buildTaskCompletionRequestPayload,
  buildTaskPostponementPayload,
  buildTaskReopenPayload,
  buildUpdateIntegracaoTaskPayload,
  INTEGRACAO_TASKS_ENDPOINTS,
  unwrapCreatedIntegracaoTask,
  unwrapIntegracaoTaskDetail,
  unwrapIntegracaoTaskList,
  unwrapTaskAttachmentAccessUrl,
  unwrapTaskAttachmentList,
  unwrapTaskCompletionRequestHistory,
  unwrapTaskPostponementHistory,
  unwrapUpdatedIntegracaoTask,
} from "./services/integracaoTasksService.contract.ts";
import {
  buildCreateTaskModelPayload,
  buildDeleteTaskModelPayload,
  buildTaskIntegrationPayload,
  buildTaskModelOptionsParams,
  buildTaskModelListParams,
  buildUpdateTaskModelPayload,
  normalizeTaskModelResponsibleSequence,
  TASK_MODEL_ENDPOINTS,
  unwrapCreatedTaskModel,
  unwrapTaskModelDetail,
  unwrapTaskModelList,
  unwrapTaskModelOptions,
  unwrapTaskModelPage,
  unwrapTaskIntegrationList,
} from "./services/taskModelService.contract.ts";
import {
  buildCreateProjectPayload,
  buildDeleteProjectPayload,
  buildProjectListParams,
  getProjectDeleteErrorMessage,
  PROJECT_DELETE_ADMIN_MESSAGE,
  buildExtractProjectTasksPayload,
  PROJECT_ENDPOINTS,
  unwrapCreatedProject,
  unwrapProjectDetail,
  unwrapProjectEnvelope,
  unwrapProjectList,
  unwrapProjectMetrics,
  unwrapProjectProgress,
  unwrapProjectWizardPreview,
  unwrapUpdatedProject,
  unwrapProjectTaskProposals,
  getProjectStatusOptions,
  mergeUpdatedProjectDetail,
} from "./services/projectService.contract.ts";
import {
  buildHireProjectPlanPayload,
  PROJECT_PLAN_ENDPOINTS,
  unwrapProjectPlanHire,
} from "./services/projectPlanService.contract.ts";
import { unwrapServiceEnvelope } from "./services/envelope.contract.js";
import {
  applyWizardTaskChange,
  getWizardTaskDateWarning,
  createProjectWizardId,
  getWizardExtractionSourceValidationMessage,
  canAttemptWizardExtraction,
  wizardExtractionConsumesAttempt,
  WIZARD_EXTRACTION_MAX_ATTEMPTS,
  WIZARD_EXTRACTION_UNAVAILABLE_CODE,
  WIZARD_EXTRACTION_MAX_SOURCE_BYTES,
  WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING,
  getProjectWizardSuccessMessage,
} from "./components/projectWizardUi.ts";
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
  getProjectTaskCardLabels,
  getTaskDeleteErrorMessage,
} from "./components/taskWorkspaceUi.ts";
import {
  TASK_FORM_BODY_CLASSNAME,
  TASK_FORM_CONTENT_CLASSNAME,
  TASK_FORM_FORM_CLASSNAME,
  TASK_FORM_GRID_CLASSNAME,
  TASK_FORM_TEXTAREA_CLASSNAME,
  TASK_URGENCY_OPTIONS,
  getDefaultTaskUrgency,
  getAutomaticTaskResponsibleId,
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
import {
  integracaoTasksListQueryKey,
  projectMetricsQueryKey,
  taskResponsibleOptionsQueryKey,
} from "./hooks/queryKeys.ts";
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

runTest("task notification deep-links open the editor and preserve clientId on close", () => {
  const source = readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8");

  assert.match(source, /const routeTaskId = routeQuery\.get\("taskId"\) \?\? undefined;/);
  assert.match(source, /setEditingTaskId\(routeTaskId\);/);
  assert.match(source, /function handleEditingTaskModalChange\(open: boolean\)/);
  assert.match(source, /const query = \{ \.\.\.router\.query \};/);
  assert.match(source, /delete query\.taskId;/);
  assert.match(
    source,
    /router\.replace\(\{ pathname: "\/tasks", query \}, undefined, \{ shallow: true \}\)/,
  );
  assert.match(source, /onOpenChange=\{handleEditingTaskModalChange\}/);
  assert.match(source, /routeQuery\.getAll\(\s*"clientId",\s*\)/);
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
  assert.match(sources.tasks, /void tasksQuery\.refetch\(\);/);
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
  assert.equal(PROJECT_ENDPOINTS.wizardPreview, "/task/project-wizard/preview");
});

runTest("project plan contratação preserva o contrato idempotente", () => {
  assert.equal(PROJECT_PLAN_ENDPOINTS.hire, "/task/project-plan/hire");
  assert.deepEqual(buildHireProjectPlanPayload({ plan_id: "plan-1", project_id: "project-1" }), {
    plan_id: "plan-1",
    project_id: "project-1",
  });
  assert.deepEqual(
    unwrapProjectPlanHire({ success: true, data: { created: [], idempotent: true } }),
    { created: [], idempotent: true },
  );
});

runTest("contratação de plano só é exposta para administrador da Integração", () => {
  const projectDetail = readFileSync(
    new URL("./components/ProjectDetailView.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    projectDetail,
    /integracaoAccess\.isAdmin \? \(\s*<button[\s\S]*?Contratar plano/,
  );
});

runTest("project wizard preview keeps the server revision and hierarchy", () => {
  const preview = unwrapProjectWizardPreview({
    success: true,
    data: {
      revision: "opaque-revision",
      tasks: [
        {
          name: "Principal",
          dependencies: [{ name: "Dependência", status: "Em Espera" }],
        },
      ],
    },
  });

  assert.equal(preview.revision, "opaque-revision");
  assert.equal(preview.tasks[0].dependencies[0].status, "Em Espera");
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

runTest("task list contract maps client and assignment filters without cache collisions", () => {
  const filters = {
    clientId: "11111111-1111-4111-8111-111111111111",
    assignment: "unassigned",
    uniqueServiceReleased: true,
  };

  assert.deepEqual(buildIntegracaoTaskListParams(filters), {
    status: "Todos",
    ref: "",
    ref_id: "",
    search: "",
    client_id: filters.clientId,
    assignment: "unassigned",
    unique_service_released: true,
    page: 1,
    limit: 20,
  });
  assert.notDeepEqual(integracaoTasksListQueryKey(filters), integracaoTasksListQueryKey({}));
});

runTest("task workspace oferece filtro de liberados e exibe empresa e projeto", () => {
  const source = readFileSync(new URL("./components/TasksWorkspace.tsx", import.meta.url), "utf8");

  assert.match(source, /uniqueServiceReleased/);
  assert.match(source, /Serviços únicos liberados/);
  assert.match(source, />Empresa</);
  assert.match(source, />Projeto</);
  assert.match(source, /task\.client_name/);
  assert.match(source, /task\.project_name/);
});

runTest("task list contract preserves an empty client filter for explicit rejection", () => {
  assert.equal(buildIntegracaoTaskListParams({ clientId: "" }).client_id, "");
  assert.notDeepEqual(
    integracaoTasksListQueryKey({ clientId: "" }),
    integracaoTasksListQueryKey({}),
  );
});

runTest("buildCreateIntegracaoTaskPayload maps create body", () => {
  assert.deepEqual(
    buildCreateIntegracaoTaskPayload({
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "department-1",
      urgency: "Alta",
    }),
    {
      model_id: "model-1",
      project_id: "project-1",
      client_id: "client-1",
      prospecting_status: "Fechado",
      department_id: "department-1",
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
  assert.equal(TASK_MODEL_ENDPOINTS.integration, "/task/integration");
  assert.deepEqual(buildTaskIntegrationPayload("model-1", "process-1", "process"), {
    task_model_id: "model-1",
    referring: "process-1",
    referring_type: "process",
  });
  assert.deepEqual(
    unwrapTaskIntegrationList({
      success: true,
      data: [{ id: "link-1", referring_type: "process", available: false }],
    }),
    [{ id: "link-1", referring_type: "process", available: false }],
  );
});

runTest("task model modal loads Regularize destinations from their own contracts", () => {
  const source = readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8");

  assert.match(source, /regularizeService\.listProcesses\(\{ status: "Todos" \}\)/);
  assert.match(source, /regularizeService\.listLicenses\(\{ status: "Todos" \}\)/);
  assert.match(source, /taskModelService\.listRegularizeLinks/);
  assert.match(source, /\(indisponível\)/);
});

runTest("task model options scope eligible responsibles by department", () => {
  assert.deepEqual(buildTaskModelOptionsParams("department-1"), {
    department_id: "department-1",
  });
  assert.deepEqual(buildTaskModelOptionsParams(), {});
  assert.deepEqual(taskResponsibleOptionsQueryKey("department-1"), [
    "task-models",
    "responsible-options",
    "department-1",
  ]);
});

runTest("task model modal uses contextual user selectors", () => {
  const options = {
    users: [{ id: "user-1", name: "Ana" }],
    departments: [{ id: "dep-1", name: "Fiscal" }],
  };

  assert.deepEqual(unwrapTaskModelOptions({ success: true, data: options }), options);
  const source = readFileSync(new URL("./components/TaskModelModal.tsx", import.meta.url), "utf8");
  assert.match(source, /useAssignableUsers/);
  assert.doesNotMatch(source, /module: "integracao"/);
  assert.match(source, /departmentId: formData\.department_id/);
  assert.match(source, /departmentService\.list\(\{ status: "Ativo" \}\)/);
  assert.doesNotMatch(source, /listAdminUsers/);
});

runTest("task form obtains legacy edit responsibles independently from project models", () => {
  const source = readFileSync(new URL("./components/TaskFormModal.tsx", import.meta.url), "utf8");

  assert.match(source, /taskModelService\.list\(\{ type: "Projeto" \}\)/);
  assert.match(source, /model\.department_id === createValues\.department_id/);
  assert.match(source, /selectedCreateTaskModel\?\.department\?\.users/);
  assert.match(source, /taskModelService\.listOptions\(editValues\.department_id\)/);
  assert.doesNotMatch(source, /useAssignableUsers/);
  assert.match(source, /departmentService\.list\(\{ status: "Ativo" \}\)/);
  assert.doesNotMatch(source, /listAdminUsers/);
});

runTest("task model mutations show the 4xx business message (dependency conflicts included)", () => {
  const source = readFileSync(new URL("./hooks/useTaskModels.tsx", import.meta.url), "utf8");

  assert.match(source, /response\?\.status && response\.status < 500/);
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
  assert.doesNotMatch(taskFormSource, /useAssignableUsers/);
  assert.match(taskFormSource, /selectedCreateTaskModel\?\.department\?\.users/);
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

runTest("tasks table fits the additional associations and keeps the shared system scrollbar", () => {
  assert.equal(TASK_TABLE_CLASSNAME.includes("1320px"), false);
  assert.equal(TASK_TABLE_CLASSNAME.includes("1440px"), true);
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
    departmentId: "department-1",
    urgency: "Normal",
    observations: "Detalhes da tarefa",
    eligibleResponsibleCount: 0,
    responsibleId: "",
  };

  assert.equal(getTaskCreateValidationMessage(validValues), null);
  assert.equal(getTaskCreateValidationMessage({ ...validValues, observations: "   " }), null);
});

runTest("task create validation names only the missing fields and skips prospecting status", () => {
  const validValues = {
    clientId: "client-1",
    projectId: "project-1",
    modelId: "model-1",
    departmentId: "department-1",
    urgency: "Normal",
    observations: "",
    eligibleResponsibleCount: 0,
    responsibleId: "",
  };

  assert.equal(getTaskCreateValidationMessage(validValues), null);
  assert.equal(
    getTaskCreateValidationMessage({ ...validValues, projectId: "" }),
    "Preencha: projeto.",
  );
  assert.equal(
    getTaskCreateValidationMessage({ ...validValues, departmentId: "", modelId: "" }),
    "Preencha: departamento, modelo.",
  );
});

runTest("task responsible selection follows default, sole, explicit and unassigned branches", () => {
  const candidates = [{ id: "leader-1" }, { id: "admin-1" }];

  assert.equal(getAutomaticTaskResponsibleId("leader-1", candidates), "leader-1");
  assert.equal(getAutomaticTaskResponsibleId("legacy", [{ id: "admin-1" }]), "admin-1");
  assert.equal(getAutomaticTaskResponsibleId("legacy", candidates), "");
  assert.equal(getAutomaticTaskResponsibleId("legacy", []), "");

  const base = {
    clientId: "client-1",
    projectId: "project-1",
    modelId: "model-1",
    departmentId: "department-1",
    urgency: "Normal",
    observations: "",
  };
  assert.match(
    getTaskCreateValidationMessage({
      ...base,
      eligibleResponsibleCount: 2,
      responsibleId: "",
    }),
    /responsável elegível/i,
  );
  assert.equal(
    getTaskCreateValidationMessage({
      ...base,
      eligibleResponsibleCount: 2,
      responsibleId: "leader-1",
    }),
    null,
  );
});

runTest("task create form offers inline project for client without projects", () => {
  const source = readFileSync("src/modules/integracao/components/TaskFormModal.tsx", "utf8");

  assert.match(source, /hasNoProjectsForSelectedClient \? \(\s*<button/);
  assert.match(source, /createProjectMutation\.mutateAsync\(/);
  assert.match(source, /<option value="">Não se aplica<\/option>/);
  assert.match(source, /toastId: "task-create-validation"/);
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

runTest("project wizard exposes the authenticated AI extraction endpoint", () => {
  assert.equal(PROJECT_ENDPOINTS.wizard, "/task/project-wizard");
  assert.equal(PROJECT_ENDPOINTS.wizardExtractTasks, "/task/project-wizard/extract-tasks");
});

runTest("wizard extraction allows only three provider attempts per opening", () => {
  assert.equal(WIZARD_EXTRACTION_MAX_ATTEMPTS, 3);
  assert.equal(canAttemptWizardExtraction(0), true);
  assert.equal(canAttemptWizardExtraction(2), true);
  assert.equal(canAttemptWizardExtraction(3), false);
  assert.equal(canAttemptWizardExtraction(4), false);
});

runTest("wizard extraction only consumes attempts that reached the provider", () => {
  assert.equal(wizardExtractionConsumesAttempt(400), false);
  assert.equal(wizardExtractionConsumesAttempt(403), false);
  assert.equal(wizardExtractionConsumesAttempt(500), false);
  assert.equal(wizardExtractionConsumesAttempt(503), false);
  assert.equal(wizardExtractionConsumesAttempt(422), true);
  assert.equal(wizardExtractionConsumesAttempt(502), true);
  assert.equal(WIZARD_EXTRACTION_UNAVAILABLE_CODE, "AI_EXTRACTION_UNAVAILABLE");
  assert.equal(wizardExtractionConsumesAttempt(undefined), true);
});

runTest("wizard extraction skips the global 5xx toast (the modal shows the error)", () => {
  const service = readFileSync(new URL("./services/projectService.ts", import.meta.url), "utf8");
  const body = service.slice(service.indexOf("async extractTasks(")).split("\n  },")[0];
  assert.match(body, /setupAPIClient\(undefined, undefined, undefined, \{ notifyServerErrors: false \}\)/);
});

runTest("wizard extraction validates text and file sources before sending", () => {
  assert.equal(getWizardExtractionSourceValidationMessage({ text: "  Ata da reunião  " }), null);
  assert.equal(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata da reunião"], "ata.md", { type: "text/markdown" }),
    }),
    null,
  );
  assert.equal(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata da reunião"], "ata.txt", { type: "text/plain" }),
    }),
    null,
  );
  assert.equal(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata da reunião"], "ata.md", { type: "text/plain" }),
    }),
    null,
  );
  assert.equal(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata da reunião"], "ata.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    }),
    null,
  );
  assert.equal(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata da reunião"], "ata.pdf", { type: "application/pdf" }),
    }),
    null,
  );
  assert.ok(getWizardExtractionSourceValidationMessage({ text: "   " }));
  assert.ok(getWizardExtractionSourceValidationMessage({}));
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      text: "a".repeat(WIZARD_EXTRACTION_MAX_SOURCE_BYTES + 1),
    }),
  );
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      file: new File([], "ata.md", { type: "text/markdown" }),
    }),
  );
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata"], "ata.exe", { type: "application/octet-stream" }),
    }),
  );
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata"], ".md", { type: "text/markdown" }),
    }),
  );
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      file: new File(["Ata"], "ata.pdf", { type: "text/plain" }),
    }),
  );
  assert.ok(
    getWizardExtractionSourceValidationMessage({
      file: new File(["a".repeat(WIZARD_EXTRACTION_MAX_SOURCE_BYTES + 1)], "ata.md", {
        type: "text/markdown",
      }),
    }),
  );
});

runTest("extraction payload carries only the project context allowed by the spec", () => {
  const payload = buildExtractProjectTasksPayload({
    content: "  Ata colada  ",
    name: "Implantação fiscal",
    objective: "Estruturar a operação",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
  });

  assert.deepEqual(payload, {
    content: "Ata colada",
    name: "Implantação fiscal",
    objective: "Estruturar a operação",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
  });
  assert.equal(Object.hasOwn(payload, "client_id"), false);
  assert.equal(
    Object.hasOwn(
      buildExtractProjectTasksPayload({
        content: "Ata",
        name: "Projeto",
        objective: "Objetivo",
        start_date: "2026-09-01",
        end_date: "",
      }),
      "end_date",
    ),
    false,
  );
});

runTest("file extraction payload uses multipart with only the permitted project context", () => {
  const file = new File(["Ata importada"], "ata.md", { type: "text/markdown" });
  const payload = buildExtractProjectTasksPayload({
    content: "Texto colado antigo",
    file,
    name: "Implantação fiscal",
    objective: "Estruturar a operação",
    start_date: "2026-09-01",
    end_date: "2026-09-30",
  });

  assert.equal(payload instanceof FormData, true);
  assert.deepEqual([...payload.keys()], ["file", "name", "objective", "start_date", "end_date"]);
  assert.equal(payload.get("file"), file);
  assert.equal(payload.get("content"), null);
  assert.equal(payload.get("client_id"), null);
});

runTest("extraction response becomes reviewable proposals with optional fields", () => {
  assert.deepEqual(
    unwrapProjectTaskProposals({
      success: true,
      data: {
        tasks: [
          {
            name: "Apurar impostos",
            prevision_date: "2026-09-10",
            department_id: "department-1",
            model_id: "model-1",
          },
          { name: "Reunir documentos" },
        ],
      },
    }),
    [
      {
        name: "Apurar impostos",
        prevision_date: "2026-09-10",
        department_id: "department-1",
        model_id: "model-1",
        responsible_id: null,
      },
      {
        name: "Reunir documentos",
        prevision_date: undefined,
        department_id: "",
        model_id: "",
        responsible_id: null,
      },
    ],
  );
});

runTest("extraction without usable proposals is treated as a failure", () => {
  for (const body of [
    { success: true, data: { tasks: [] } },
    { success: true, data: { tasks: [{ name: "   " }] } },
    { success: true, data: {} },
    { success: true, data: { tasks: "nao-e-lista" } },
  ]) {
    assert.throws(() => unwrapProjectTaskProposals(body), /Ata/);
  }
});

runTest("step 2 only sends the meeting minutes after an explicit click and warns about OpenAI", () => {
  const projectForm = readFileSync("src/modules/integracao/components/ProjectFormModal.tsx", "utf8");

  assert.match(projectForm, /Extrair tarefas com IA/);
  assert.match(projectForm, /OpenAI/);
  assert.match(projectForm, /onClick=\{\(\) => void handleExtractTasks\(\)\}/);
  assert.doesNotMatch(projectForm, /onChange=\{[^}]*handleExtractTasks/);
});

runTest("extraction proposals carry the AI deadline warning for review", () => {
  const [proposal] = unwrapProjectTaskProposals({
    success: true,
    data: {
      tasks: [
        {
          name: "Apurar impostos",
          department_id: "department-1",
          prevision_date_warning: "Prazo não reconhecido.",
        },
      ],
    },
  });

  assert.deepEqual(proposal, {
    name: "Apurar impostos",
    prevision_date: undefined,
    department_id: "department-1",
    model_id: "",
    responsible_id: null,
    prevision_date_warning: "Prazo não reconhecido.",
  });
});

runTest("changing department drops the incompatible model and responsible", () => {
  const models = [
    { id: "model-1", department_id: "department-1", responsible_id: "user-1", department: { users: [{ id: "user-1" }, { id: "user-2" }] } },
  ];
  const task = { name: "Tarefa", prevision_date: "2026-09-10", department_id: "department-1", model_id: "model-1", responsible_id: "user-1" };

  assert.deepEqual(applyWizardTaskChange(task, "department_id", "department-2", models), {
    ...task,
    department_id: "department-2",
    model_id: "",
    responsible_id: null,
  });
});

runTest("changing model assigns the automatic responsible and drops the previous one", () => {
  const models = [
    { id: "model-1", department_id: "department-1", responsible_id: "user-1", department: { users: [{ id: "user-1" }, { id: "user-2" }] } },
    { id: "model-2", department_id: "department-1", responsible_id: "user-9", department: { users: [{ id: "user-2" }] } },
    { id: "model-3", department_id: "department-2", responsible_id: "user-3", department: { users: [{ id: "user-3" }] } },
  ];
  const task = { name: "Tarefa", department_id: "department-1", model_id: "model-1", responsible_id: "user-1" };

  assert.equal(applyWizardTaskChange(task, "model_id", "model-2", models).responsible_id, "user-2");
  assert.equal(applyWizardTaskChange(task, "model_id", "model-3", models).responsible_id, null);
});

runTest("editing the deadline clears the AI warning attached to it", () => {
  const task = { name: "Tarefa", department_id: "", model_id: "", responsible_id: null, prevision_date_warning: "Prazo não reconhecido." };

  assert.deepEqual(applyWizardTaskChange(task, "prevision_date", "2026-09-10", []), {
    name: "Tarefa",
    department_id: "",
    model_id: "",
    responsible_id: null,
    prevision_date: "2026-09-10",
    prevision_date_warning: undefined,
  });
  assert.equal(applyWizardTaskChange(task, "name", "Outra", []).prevision_date_warning, "Prazo não reconhecido.");
});

runTest("wizard task warns about an unusable AI deadline and about one outside the project period", () => {
  const start = "2026-09-01";
  const end = "2026-09-30";

  assert.equal(getWizardTaskDateWarning({ prevision_date_warning: "Prazo não reconhecido." }, start, end), "Prazo não reconhecido.");
  assert.equal(getWizardTaskDateWarning({ prevision_date: "2026-09-10" }, start, end), null);
  assert.equal(getWizardTaskDateWarning({ prevision_date: "2026-08-31" }, start, end), WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING);
  assert.equal(getWizardTaskDateWarning({ prevision_date: "2026-10-01" }, start, end), WIZARD_TASK_DATE_OUTSIDE_PERIOD_WARNING);
  assert.equal(getWizardTaskDateWarning({ prevision_date: "2026-10-01" }, start, ""), null);
  assert.equal(getWizardTaskDateWarning({}, start, end), null);
});

runTest("project wizard IDs still work when crypto.randomUUID is unavailable", () => {
  let randomValuesCalls = 0;
  const id = createProjectWizardId({
    getRandomValues: (values) => {
      randomValuesCalls += 1;
      values.fill(0xab);
      return values;
    },
  });

  assert.equal(randomValuesCalls, 1);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const projectForm = readFileSync(
    new URL("./components/ProjectFormModal.tsx", import.meta.url),
    "utf8",
  );
  assert.equal((projectForm.match(/createProjectWizardId\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(projectForm, /crypto\.randomUUID\(\)/);
});

runTest("AI proposals arrive with the automatic responsible of the proposed model", () => {
  const models = [
    { id: "model-1", department_id: "department-1", responsible_id: null, department: { users: [{ id: "user-1" }] } },
    { id: "model-2", department_id: "department-1", responsible_id: null, department: { users: [{ id: "user-1" }, { id: "user-2" }] } },
  ];
  const proposal = { name: "Apurar impostos", department_id: "department-1", model_id: "model-1", responsible_id: null };

  assert.equal(applyWizardTaskChange(proposal, "model_id", proposal.model_id, models).responsible_id, "user-1");
  assert.equal(applyWizardTaskChange({ ...proposal, model_id: "model-2" }, "model_id", "model-2", models).responsible_id, null);
  assert.equal(applyWizardTaskChange({ ...proposal, model_id: "" }, "model_id", "", models).responsible_id, null);
});

runTest("step 2 accepts DOCX and PDF meeting minutes alongside TXT and Markdown", () => {
  const projectForm = readFileSync("src/modules/integracao/components/ProjectFormModal.tsx", "utf8");

  assert.match(projectForm, /Selecione um arquivo \.txt, \.md, \.docx ou \.pdf/);
  assert.match(
    projectForm,
    /accept="[^"]*\.docx[^"]*application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
  );
  assert.match(projectForm, /accept="[^"]*\.pdf[^"]*application\/pdf"/);
});

runTest("project detail task card shows the task name, model only as secondary info", () => {
  const model = { id: "model-1", name: "Teste" };

  assert.deepEqual(getProjectTaskCardLabels({ id: "t1", name: "QA_Tarefa_Projeto", model }), {
    title: "QA_Tarefa_Projeto",
    modelName: "Teste",
  });
  assert.deepEqual(getProjectTaskCardLabels({ id: "t2", name: "Teste", model }), {
    title: "Teste",
    modelName: null,
  });
  assert.deepEqual(getProjectTaskCardLabels({ id: "t3", name: "  ", model }), {
    title: "Teste",
    modelName: null,
  });
  assert.deepEqual(getProjectTaskCardLabels({ id: "t4" }), {
    title: "Tarefa sem nome",
    modelName: null,
  });

  const detailView = readFileSync("src/modules/integracao/components/ProjectDetailView.tsx", "utf8");
  assert.match(detailView, /getProjectTaskCardLabels\(task\)/);
  assert.doesNotMatch(detailView, /task\.model\?\.name \|\| task\.name/);
});

runTest("task delete error surfaces the 409 reason from the API", () => {
  const reason = "Não é possível excluir a tarefa: ela tem 1 anexo(s). Remova os anexos.";

  assert.equal(
    getTaskDeleteErrorMessage({ response: { status: 409, data: { error: reason } } }),
    reason,
  );
  assert.match(
    getTaskDeleteErrorMessage({ response: { status: 403, data: {} } }),
    /permissão administrativa/,
  );
  assert.equal(getTaskDeleteErrorMessage(new Error("boom")), "Não foi possível excluir a tarefa.");

  const workspace = readFileSync("src/modules/integracao/components/TasksWorkspace.tsx", "utf8");
  assert.match(workspace, /getTaskDeleteErrorMessage\(error\)/);
});

runTest("task edit form only sets the first prevision directly", () => {
  assert.deepEqual(taskFormUi.getInitialPrevisionPatch(null, "2026-10-15"), {
    prevision_date: "2026-10-15",
  });
  assert.deepEqual(taskFormUi.getInitialPrevisionPatch(null, ""), {});
  assert.deepEqual(taskFormUi.getInitialPrevisionPatch("2026-10-01T00:00:00.000Z", "2026-10-20"), {});

  const source = readFileSync("src/modules/integracao/components/TaskFormModal.tsx", "utf8");
  assert.match(source, /getInitialPrevisionPatch\(/);
  assert.match(source, /readOnly=\{!canSetInitialPrevision\}/);
});

runTest("project edit keeps client and tasks after PUT and offers manual statuses", () => {
  const previous = {
    id: "p1",
    name: "Antigo",
    status: "Em andamento",
    client: { id: "c1", name: "Cliente" },
    tasks: [{ id: "t1", name: "Tarefa" }],
  };
  const merged = mergeUpdatedProjectDetail(previous, { id: "p1", name: "Novo", status: "Paralisado" });

  assert.equal(merged.name, "Novo");
  assert.equal(merged.status, "Paralisado");
  assert.deepEqual(merged.client, previous.client);
  assert.deepEqual(merged.tasks, previous.tasks);
  assert.deepEqual(mergeUpdatedProjectDetail(undefined, { id: "p1" }), { id: "p1" });

  assert.deepEqual(getProjectStatusOptions("Em andamento"), ["Em andamento", "Paralisado", "Concluído"]);
  assert.deepEqual(getProjectStatusOptions("A realizar"), [
    "A realizar",
    "Em andamento",
    "Paralisado",
    "Concluído",
  ]);

  const hooks = readFileSync("src/modules/integracao/hooks/useProjects.ts", "utf8");
  assert.match(hooks, /mergeUpdatedProjectDetail\(/);
});

runTest("wizard success toast speaks business language", () => {
  assert.equal(
    getProjectWizardSuccessMessage({ main: 2, dependencies: 1, unassigned: 0 }),
    "Projeto criado com 3 tarefas.",
  );
  assert.equal(
    getProjectWizardSuccessMessage({ main: 1, dependencies: 0, unassigned: 1 }),
    "Projeto criado com 1 tarefa. 1 ainda sem responsável.",
  );

  const form = readFileSync("src/modules/integracao/components/ProjectFormModal.tsx", "utf8");
  assert.doesNotMatch(form, /Dependências: \$\{/);
  assert.doesNotMatch(form, /<CalendarDays className="pointer-events-none/);
  assert.match(form, /formatProjectDate\(values\.start_date\)/);
  assert.match(form, /<RequiredFieldLabel required=\{candidates\.length > 0\}>/);
  assert.match(form, /\?\? models\[0\]\)\?\.department/);
});

runTest("task errors do not repeat the global 5xx toast", () => {
  assert.equal(isServerErrorAlreadyNotified({ response: { status: 502 } }), true);
  assert.equal(isServerErrorAlreadyNotified({ response: { status: 409 } }), false);
  assert.equal(isServerErrorAlreadyNotified(new Error("network")), false);

  for (const file of ["TaskFormModal.tsx", "TasksWorkspace.tsx"]) {
    const source = readFileSync(`src/modules/integracao/components/${file}`, "utf8");
    assert.match(source, /isServerErrorAlreadyNotified\(error\)/, file);
    assert.doesNotMatch(source, /task-service/, file);
  }
  const workspace = readFileSync("src/modules/integracao/components/TasksWorkspace.tsx", "utf8");
  assert.match(workspace, /task\.responsible_name/);
  const page = readFileSync("src/pages/projects/index.tsx", "utf8");
  assert.match(page, /<title>Projetos<\/title>/);
});
