export interface DepItem {
  id: string;
  name: string;
  color: string;
  status: string;
  solution: boolean;
}

export interface CreateDepData {
  name: string;
  color: string;
  solution: boolean;
  status: string;
}

export interface UpdateDepData {
  name?: string;
  color?: string;
  solution?: boolean;
  status?: string;
}
