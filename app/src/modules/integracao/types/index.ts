export interface TaskModel {
  id: string;
  name: string;
  department_id: string;
  responsible_id: string;
  responsible2_id: string;
  responsible3_id: string;
  observations: string;
  billing: string;
  prevision: number;
  type: "Projeto";
  department: {
    id: string;
    name: string;
  };
}

export interface CreateTaskModelData {
  name: string;
  department_id: string;
  responsible_id: string;
  responsible2_id: string;
  responsible3_id: string;
  observations: string;
  billing: string;
  prevision: number;
  type: "Projeto";
}

export interface UpdateTaskModelData extends Partial<CreateTaskModelData> {
  id: string;
}

export interface TaskDependent {
  id: string;
  dependent_id: string;
  wait: boolean;
  observation: string;
  dependent: {
    name: string;
  };
}

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
