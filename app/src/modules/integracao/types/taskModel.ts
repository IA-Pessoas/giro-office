export interface TaskModelListItem {
  id: string;
  name: string;
  department_id: string;
  responsible_id: string | null;
  department?: {
    id: string;
    name: string;
    users: TaskModelOption[];
  };
}

export interface TaskModelDetail {
  id: string;
  name: string;
  department_id: string;
  responsible_id: string;
  responsible2_id: string | null;
  responsible3_id: string | null;
  observations: string | null;
  billing: string;
  prevision: number;
  type: string | null;
}

/** Item de lista enriquecido no cliente (ex.: nome do departamento). */
export interface TaskModel extends TaskModelListItem {
  responsible2_id?: string | null;
  responsible3_id?: string | null;
  observations?: string | null;
  billing?: string;
  prevision?: number;
  type?: string | null;
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

export interface UpdateTaskModelData extends CreateTaskModelData {
  id: string;
}

export interface TaskModelListParams {
  type?: string;
  billing?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaskModelOption {
  id: string;
  name: string;
}

export interface TaskModelOptions {
  users: TaskModelOption[];
  departments: TaskModelOption[];
}

export interface TaskDependent {
  id: string;
  task_id: string;
  dependent_id: string;
  wait: boolean;
  observation: string;
  dependent: {
    id: string;
    name: string;
  };
}

export interface CreateTaskDependentData {
  task_model_id: string;
  dependent_id: string;
  wait: boolean;
  observation: string;
}
