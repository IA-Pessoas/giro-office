export interface AuthIdentity {
  user_id: string;
  organization_id?: string;
  permission?: number;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  organizationId: string;
  claims: AuthIdentity;
}

export interface AuthPolicy {
  minPermission?: number;
}
