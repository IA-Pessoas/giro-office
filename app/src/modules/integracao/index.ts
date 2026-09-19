export { ClientProjectsSection } from "./components/ClientProjectsSection";
export { ProjectDetailView } from "./components/ProjectDetailView";
export { ProjectFormModal } from "./components/ProjectFormModal";
export { ProjectListTable } from "./components/ProjectListTable";
export { ProjectProgressBar } from "./components/ProjectProgressBar";
export { ProjectsWorkspace } from "./components/ProjectsWorkspace";
export { TaskFormModal } from "./components/TaskFormModal";
export { TaskModelModal } from "./components/TaskModelModal";
export { TasksWorkspace } from "./components/TasksWorkspace";

export {
  INTEGRACAO_TASKS_QUERY_KEY,
  projectDetailQueryKey,
  projectListQueryKey,
  projectMetricsQueryKey,
  PROJECTS_QUERY_KEY,
  TASK_MODELS_QUERY_KEY,
  integracaoTaskDetailQueryKey,
  integracaoTasksListQueryKey,
  taskModelsListQueryKey,
  useCreateIntegracaoTaskMutation,
  useCreateProjectMutation,
  useCreateProjectWizardMutation,
  useDeleteIntegracaoTaskMutation,
  useDeleteProjectMutation,
  useIntegracaoTaskDetail,
  useIntegracaoTasksList,
  useProjectDetail,
  useProjectPlans,
  useProjectPlanTasks,
  useHireProjectPlanMutation,
  useProjectForm,
  useProjectMetrics,
  useProjectsList,
  useRecalculateProjectProgressMutation,
  useTaskModels,
  useUpdateIntegracaoTaskMutation,
  useUpdateProjectMutation,
} from "./hooks";

export {
  INTEGRACAO_TASKS_ENDPOINTS,
  TASK_MODEL_ENDPOINTS,
  integracaoTasksService,
  projectService,
  projectPlanService,
  taskModelService,
} from "./services";
export {
  TASK_MODEL_CONFIG_ENTRY,
  canViewTaskModelConfig,
  canManageTaskModelConfig,
} from "./navigation/taskModelConfigNavigation";

export {
  INTEGRACAO_TASK_STATUS_VALUES,
  PROSPECTING_STATUS_VALUES,
} from "./types";

export type {
  CreateIntegracaoTaskBody,
  CreateProjectData,
  CreateProjectWizardData,
  CreateTaskModelData,
  DeleteProjectData,
  IntegracaoTaskDetail,
  IntegracaoTaskListItem,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  IntegracaoTaskStatus,
  ProjectClientSummary,
  ProjectDetail,
  ProjectFormValues,
  ProjectListItem,
  ProjectListParams,
  ProjectMetrics,
  ProjectTaskMetrics,
  ProjectProgressResponse,
  ProjectWizardPreview,
  ProjectWizardPreviewDependency,
  ProjectWizardPreviewTask,
  ProjectWizardResult,
  ProjectTaskSummary,
  ProspectingStatus,
  RecalculateProjectProgressData,
  TaskDependent,
  TaskBilling,
  TaskModel,
  UpdateIntegracaoTaskBody,
  UpdateProjectData,
  UpdateTaskModelData,
} from "./types";
