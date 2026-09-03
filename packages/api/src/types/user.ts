/** User shape returned by user-detail and list endpoints (aligned with app modules/users). */
export interface ApiUserDepartment {
  name: string;
  color: string;
}

export interface UserItem {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  status: string;
  version: number;
  photo?: string | null;
  photo_url?: string | null;
  department?: ApiUserDepartment;
}

export interface UserDetailApiResponse {
  user: UserItem;
}
