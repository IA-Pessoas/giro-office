import type { AuthContext } from "@workspace/shared/auth";
import type { Logger } from "@workspace/shared/logger";

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
