declare namespace Express {
  export interface Request {
    user_id: string;
    requestId?: string;
    organization_id: string;
    platform_identity?: {
      id: string;
      name: string;
      email: string;
      auth_kind: "platform";
      platform_role: "super_admin";
    };
    platform_session?: {
      user_id: string;
      auth_kind: "platform";
      platform_role: "super_admin";
      session_version: number;
      session_id: string;
      csrf_hash: string;
    };
  }
}
