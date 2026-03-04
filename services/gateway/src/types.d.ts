import type { AuthContext } from "@workspace/shared";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
    }
  }
}

export {};
