export interface AuthClaims {
  sub: string;
  permission?: number;
  organization_id?: string;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  organization_id: string;
  claims: AuthClaims;
}

export interface AuthPolicy {
  minPermission?: number;
}
