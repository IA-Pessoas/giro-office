/** GET /me — sessão atual (campos dependem do backend). */
export interface MeSessionUser {
  id?: string;
  name?: string;
  login?: string;
  permission?: number;
  password?: string | null;
}

export interface MeApiResponse {
  user: MeSessionUser;
}

export interface UpdateCurrentUserPayload {
  name: string;
  password: string;
  permission: number;
  status: string;
}
