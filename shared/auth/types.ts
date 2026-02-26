export interface AuthClaims {
  sub: string;
  permission?: number;
  name?: string;
  login?: string;
  [key: string]: unknown;
}

export interface AuthContext {
  token: string;
  userId: string;
  claims: AuthClaims;
}

export interface AuthPolicy {
  minPermission?: number;
}
