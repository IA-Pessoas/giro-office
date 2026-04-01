/** GET /me — sessão atual (campos dependem do backend). */
export interface MeSessionUser {
  id?: string;
  name?: string;
  login?: string;
  permission?: number;
}

export interface MeApiResponse {
  user: MeSessionUser;
}

export interface UpdateCurrentUserPayload {
  name: string;
  permission: number;
  status: string;
  /** Incluir apenas quando a UI permitir alteração de senha. */
  password?: string;
}
