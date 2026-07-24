import { createSuccessResponse, error as logError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { RegularizeServiceEnv } from "../config/env.js";
import { requireInternalToken } from "../middlewares/requireInternalToken.js";

export interface RegularizeInternalRouteDeps {
  env: RegularizeServiceEnv;
  runReconciliation: () => Promise<Record<string, unknown>>;
  runLicenseNotificationReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfStatusReconciliation: () => Promise<Record<string, unknown>>;
  runClientPfDocumentsReconciliation: () => Promise<Record<string, unknown>>;
}

export function createRegularizeInternalRoutes(deps: RegularizeInternalRouteDeps): Router {
  const router = Router();
  const requireToken = requireInternalToken(deps.env);

  router.post(
    "/reconciliation/run",
    requireToken,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        const result = await deps.runReconciliation();
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao executar reconciliacao do regularize", { err });
        next(err);
      }
    },
  );

  router.post(
    "/reconciliation/license-notifications/run",
    requireToken,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        const result = await deps.runLicenseNotificationReconciliation();
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao executar reconciliacao de notificacoes de licencas", { err });
        next(err);
      }
    },
  );

  router.post(
    "/reconciliation/client-pf-status/run",
    requireToken,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        const result = await deps.runClientPfStatusReconciliation();
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao executar reconciliacao de status PF", { err });
        next(err);
      }
    },
  );

  router.post(
    "/reconciliation/client-pf-documents/run",
    requireToken,
    async (_request: Request, response: Response, next: NextFunction) => {
      try {
        const result = await deps.runClientPfDocumentsReconciliation();
        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao executar reconciliacao de documentos PF", { err });
        next(err);
      }
    },
  );

  return router;
}
