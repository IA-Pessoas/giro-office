import type { AuthContext } from "@workspace/shared";
import type { Logger } from "@workspace/shared/logger";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      log?: Logger;
      requestId?: string;
    }
  }
}
