import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  addMonthlyObligationBodySchema,
  monthlyControlIdParamsSchema,
  monthlyObligationParamsSchema,
  updateMonthlyObligationBodySchema,
} from "../schemas/monthlyControl.schemas.js";
import type { MonthlyObligationService } from "../services/monthlyObligationService.js";

export type MonthlyObligationRouteDeps = Pick<MonthlyObligationService, "list" | "add" | "update">;

function actor(req: Request) {
  const auth = requireAuthenticatedRequestContext(req);
  return {
    userId: auth.user_id,
    organizationId: auth.organization_id,
    permission: auth.permission,
  };
}

export function createMonthlyObligationRoutes(
  service: MonthlyObligationRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/monthly-controls/:id/obligations",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(monthlyControlIdParamsSchema, req.params);
        res.json(createSuccessResponse(await service.list(id, actor(req))));
      } catch (err) {
        logError("Erro ao listar obrigações do controle fiscal", { err });
        next(err);
      }
    },
  );

  router.post(
    "/monthly-controls/:id/obligations",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(monthlyControlIdParamsSchema, req.params);
        const body = parseWithZod(addMonthlyObligationBodySchema, req.body);
        res.status(201).json(createSuccessResponse(await service.add(id, body, actor(req))));
      } catch (err) {
        logError("Erro ao incluir obrigação no controle fiscal", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/monthly-controls/:id/obligations/:code",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, code } = parseWithZod(monthlyObligationParamsSchema, req.params);
        const body = parseWithZod(updateMonthlyObligationBodySchema, req.body);
        res.json(createSuccessResponse(await service.update(id, code, body, actor(req))));
      } catch (err) {
        logError("Erro ao alterar obrigação do controle fiscal", { err });
        next(err);
      }
    },
  );

  return router;
}
