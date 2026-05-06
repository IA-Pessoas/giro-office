export interface MeProfile {
  id: string;
  name: string;
  login: string;
  permission: number;
  photo_url: string | null;
  organization_id: string | null;
  type: "owner" | "admin" | "user" | null;
}

export interface MeSessionUser extends MeProfile {}

export interface MeApiResponse {
  success?: boolean;
  data?: MeSessionUser;
  user?: MeSessionUser;
}

export interface UpdateCurrentUserPayload {
  name: string;
  password?: string;
}
