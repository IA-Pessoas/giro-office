import type { TriagemRequestContext } from "./middlewares/requestContext.js";

declare global {
  namespace Express {
    interface Request {
      triagemContext?: TriagemRequestContext;
    }
  }
}
