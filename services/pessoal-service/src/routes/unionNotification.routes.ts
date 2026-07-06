import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { UnionNotificationService } from "../services/unionNotificationService.js";

export interface PessoalInternalNotificationRouteOptions {
  internalServiceToken: string;
  service: UnionNotificationService;
}

export function createPessoalInternalNotificationRoutes(
  options: PessoalInternalNotificationRouteOptions,
): Router {
  const router = Router();

  router.post("/run", async (request, response, next) => {
    try {
      const token = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
      if (!token) {
        throw new ServiceError(401, "Token interno nao informado.");
      }
      if (token !== options.internalServiceToken) {
        throw new ServiceError(403, "Acesso negado.");
      }

      const result = await options.service.runForDate({ now: new Date() });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao executar notificacoes internas de sindicatos", { err });
      next(err);
    }
  });

  return router;
}
