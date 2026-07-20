export type {
  CreateIntegracaoTaskBody,
  IntegracaoTaskDetail,
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
  TaskModel,
  TaskModelDetail,
  TaskModelListItem,
  TaskModelListParams,
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

export interface UpdateProjectData {
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  objective: string;
}

export interface DeleteProjectData {
  project_id: string;
}

export interface RecalculateProjectProgressData {
  project_id: string;
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
}
