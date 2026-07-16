declare namespace Express {
  export interface Request {
    user_id: string;
    organization_id: string;
    permission?: number;
    user_type?: "owner" | "admin" | "user";
    auth_kind?: "organization" | "platform";
    platform_role?: "super_admin";
    support_mode?: boolean;
    support_session_id?: string;
    support_organization_id?: string;
    modules?: Record<string, number | null>;
    requestId?: string;
  }
}
