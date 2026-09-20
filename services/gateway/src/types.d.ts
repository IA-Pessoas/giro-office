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
      /** Bytes originais do corpo JSON, preservados por express.json({ verify }). */
      rawBody?: Buffer;
      user_id: string;
      organization_id: string;
    }
  }
}
