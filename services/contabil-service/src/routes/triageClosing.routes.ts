import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  triageClosingQuerySchema,
  triageClosingUpdateBodySchema,
} from "../schemas/triageClosing.schemas.js";
import type { TriageClosingService } from "../services/triageClosingService.js";

export type TriageClosingRouteDeps = Pick<TriageClosingService, "archive" | "get" | "update">;

function authContext(request: Request) {
  const auth = requireAuthenticatedRequestContext(request);
  return {
    userId: auth.user_id,
    organizationId: auth.organization_id,
    permission: auth.permission,
    modules: request.modules,
  };
}

export function createTriageClosingRoutes(
  service: TriageClosingRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/closing",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(triageClosingQuerySchema, req.query);
        const auth = authContext(req);
        res.json(createSuccessResponse(await service.get(query, auth.organizationId)));
      } catch (err) {
        logError("Erro ao consultar fechamento recebido", { err });
        next(err);
      }
    },
  );

  router.put(
    "/closing",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(triageClosingUpdateBodySchema, req.body);
        res.json(createSuccessResponse(await service.update(body, authContext(req))));
      } catch (err) {
        logError("Erro ao atualizar fechamento recebido", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/closing",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(triageClosingQuerySchema, req.body);
        res.json(createSuccessResponse(await service.archive(body, authContext(req))));
      } catch (err) {
        logError("Erro ao arquivar fechamento recebido", { err });
        next(err);
      }
    },
  );

  return router;
}
