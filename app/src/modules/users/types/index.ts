export interface UserItem {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  status: string;
  photo?: string | null;
  photo_url?: string | null;
  department?: {
    name: string;
    color: string;
  };
}

export interface CreateUserData {
  name: string;
  login: string;
  password: string;
  department_id: string;
  permission: number;
}

export interface UpdateUserData {
  name?: string;
  password?: string;
  permission?: number;
  department_id?: string;
  status?: string;
  file?: File;
}
