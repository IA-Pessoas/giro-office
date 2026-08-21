import type { AuthContext, Logger } from "@workspace/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      authTransport?: "cookie" | "bearer";
      log?: Logger;
      requestId?: string;
      auditErrorCode?: string;
      auditErrorMessage?: string;
      user_id: string;
      organization_id: string;
    }
  }
}
