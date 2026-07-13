import type { ParcelamentoRequestContext } from "./middlewares/requestContext.js";

declare global {
  namespace Express {
    interface Request {
      parcelamentoContext?: ParcelamentoRequestContext;
    }
  }
}
