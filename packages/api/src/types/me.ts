export interface MeProfile {
  id: string;
  name: string;
  login: string;
  permission: number;
  department_id: string;
  photo_url: string | null;
  organization_id: string | null;
  type: "owner" | "admin" | "user" | null;
  department?: {
    name: string;
    color: string;
  };
}

export interface MeSessionUser extends MeProfile {}

export interface MeApiResponse {
  success?: boolean;
  data?: MeSessionUser;
  user?: MeSessionUser;
}

export type UpdateCurrentUserPayload =
  | {
      password: string;
      name?: never;
    }
  | {
      name: string;
      password?: string;
    };
