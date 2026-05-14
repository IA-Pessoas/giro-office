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

export interface Project {
  id: string;
  name: string;
  objective: string;
  start_date: string | null;
  end_date: string | null;
  sponsor_id: string | null;
  client_id: string;
  prospecting_status?: string;
  [key: string]: any;
}

export interface CreateProjectData {
  name: string;
  objective: string;
  start_date: string | null;
  end_date: string | null;
  sponsor_id: string | null;
  client_id: string;
  prospecting_status?: string;
  tasks?: ProjectTaskItem[];
}

export interface UpdateProjectData extends Partial<CreateProjectData> {
  id: string;
}

export interface ProjectTaskItem {
  tempId?: string;
  modelId: string;
  modelName: string;
  departmentName: string;
  observation: string;
  isExisting?: boolean;
  originalId?: string;
  status?: string;
}
