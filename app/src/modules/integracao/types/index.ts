export type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskDetail,
  IntegracaoTaskCompletionDecision,
  IntegracaoTaskCompletionRequest,
  IntegracaoTaskCompletionRequestStatus,
  IntegracaoTaskAttachment,
  IntegracaoTaskPostponement,
  IntegracaoTaskListItem,
  IntegracaoTaskListParams,
  IntegracaoTaskListResult,
  IntegracaoTaskStatus,
  ProspectingStatus,
  TaskBilling,
  UpdateIntegracaoTaskBody,
} from "./integracaoTask";
export {
  INTEGRACAO_TASK_STATUS_VALUES,
  PROSPECTING_STATUS_VALUES,
} from "./integracaoTask";

export type {
  CreateTaskDependentData,
  CreateTaskModelData,
  TaskDependent,
  TaskIntegrationRegularize,
  TaskModel,
  TaskModelDetail,
  TaskModelListItem,
  TaskModelListParams,
  TaskModelOption,
  TaskModelOptions,
  UpdateTaskModelData,
} from "./taskModel";

export interface ProjectListParams {
  ref: "client";
  id: string;
}

export interface ProjectClientSummary {
  id: string;
  name: string;
  company_name?: string | null;
  fantasy_name?: string | null;
  cpf_cnpj?: string | null;
}

export interface ProjectTaskSummary {
  id: string;
  name?: string | null;
  status?: string | null;
  observations?: string | null;
  observation?: string | null;
  model_id?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  department?: {
    id: string;
    name: string;
  } | null;
  model?: {
    id: string;
    name: string;
    department?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

export interface ProjectListItem {
  id: string;
  name: string;
  objective: string;
  status: string;
  porcentage: number;
  start_date: string;
  end_date: string | null;
  client_id: string;
}

export interface ProjectDetail extends ProjectListItem {
  client?: ProjectClientSummary | null;
  tasks?: ProjectTaskSummary[];
}

export interface CreateProjectData {
  client_id: string;
  name: string;
  start_date: string;
  objective: string;
  end_date?: string | null;
}

export interface CreateProjectWizardData extends CreateProjectData {
  idempotencyKey: string;
  revision: string;
  tasks?: ProjectWizardTask[];
}

export interface ProjectWizardTask {
  name: string;
  department_id: string;
  model_id: string;
  prevision_date?: string;
  responsible_id: string | null;
}

interface ExtractProjectTasksContext {
  content: string;
  name: string;
  objective: string;
  start_date: string;
  end_date?: string | null;
}

/** Proposta da IA: o aviso é estado de revisão e nunca faz parte do payload enviado. */
export interface ProjectWizardTaskProposal extends ProjectWizardTask {
  prevision_date_warning?: string;
}

export type ExtractProjectTasksData =
  | ExtractProjectTasksContext
  | (Omit<ExtractProjectTasksContext, "content"> & { file: File });

export interface ProjectWizardResult {
  project: ProjectListItem;
  counts: {
    main: number;
    dependencies: number;
    unassigned: number;
  };
}

export interface ProjectWizardPreview {
  tasks: ProjectWizardPreviewTask[];
  revision: string;
}

export interface ProjectWizardPreviewTask extends ProjectWizardTask {
  status: "A Realizar" | "Em Espera";
  observation: string;
  dependencies: ProjectWizardPreviewDependency[];
}

export interface ProjectWizardPreviewDependency {
  name: string;
  model_id: string;
  department_id: string;
  status: "A Realizar" | "Em Espera";
  observation: string;
  responsible_id: string | null;
}

export interface UpdateProjectData {
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  objective: string;
  status?: string;
}

export interface DeleteProjectData {
  project_id: string;
}

export interface RecalculateProjectProgressData {
  project_id: string;
}

export interface ProjectTaskMetrics {
  total: number;
  completed: number;
  open: number;
  paused: number;
  emptyStatus: number;
}

export interface ProjectMetrics {
  total: number;
  completed: number;
  inProgress: number;
  paused: number;
  toDo: number;
  notContracted: number;
  taskMetrics: ProjectTaskMetrics;
}

export interface ProjectProgressResponse {
  id?: string;
  porcentage: number;
  status: string;
}

export interface ProjectFormValues {
  name: string;
  start_date: string;
  end_date: string;
  objective: string;
  status: string;
}
