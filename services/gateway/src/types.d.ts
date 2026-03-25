import type { AuthContext, Logger } from "@workspace/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      log?: Logger;
      requestId?: string;
      auditErrorCode?: string;
      auditErrorMessage?: string;
    }
  }
}
