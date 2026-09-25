import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { GroupAssignmentService } from "../services/groupAssignmentService.js";

export interface GroupAssignmentOutboxRouteOptions {
  internalServiceToken: string;
  service: GroupAssignmentService;
}

export function createGroupAssignmentOutboxRoutes(
  options: GroupAssignmentOutboxRouteOptions,
): Router {
  const router = Router();

  router.post("/reconcile", async (request, response, next) => {
    try {
      const token = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
      if (!token) throw new ServiceError(401, "Token interno não informado.");
      if (token !== options.internalServiceToken) throw new ServiceError(403, "Acesso negado.");

      response
        .status(200)
        .json(createSuccessResponse(await options.service.reconcilePendingAuditEvents()));
    } catch (err: unknown) {
      logError("Erro ao reconciliar a outbox de auditoria de atribuicao em lote", { err });
      next(err);
    }
  });

  return router;
}
