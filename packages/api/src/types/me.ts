export interface MeProfile {
  name: string;
  login: string;
  permission: number;
  photo_url: string | null;
}

export interface MeSessionUser extends MeProfile {}

export interface MeApiResponse {
  success?: boolean;
  data?: MeProfile;
  user?: MeProfile;
}

export interface UpdateCurrentUserPayload {
  name: string;
  password?: string;
}
