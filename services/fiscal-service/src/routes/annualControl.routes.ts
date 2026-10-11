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
  addAnnualDeclarationBodySchema,
  annualControlIdParamsSchema,
  annualDeclarationParamsSchema,
  listAnnualControlsQuerySchema,
  updateAnnualDeclarationBodySchema,
} from "../schemas/annualControl.schemas.js";
import type { AnnualControlService } from "../services/annualControlService.js";

export type AnnualControlRouteDeps = Pick<
  AnnualControlService,
  "list" | "items" | "addItem" | "updateItem"
>;

function actor(req: Request) {
  const auth = requireAuthenticatedRequestContext(req);
  return {
    userId: auth.user_id,
    organizationId: auth.organization_id,
    permission: auth.permission,
  };
}

export function createAnnualControlRoutes(
  service: AnnualControlRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/annual-controls",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listAnnualControlsQuerySchema, req.query);
        res.json(createSuccessResponse(await service.list(query, actor(req))));
      } catch (err) {
        logError("Erro ao listar controles fiscais anuais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/annual-controls/:id/items",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(annualControlIdParamsSchema, req.params);
        res.json(createSuccessResponse(await service.items(id, actor(req))));
      } catch (err) {
        logError("Erro ao listar declarações do controle anual", { err });
        next(err);
      }
    },
  );

  router.post(
    "/annual-controls/:id/items",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(annualControlIdParamsSchema, req.params);
        const body = parseWithZod(addAnnualDeclarationBodySchema, req.body);
        res.status(201).json(createSuccessResponse(await service.addItem(id, body, actor(req))));
      } catch (err) {
        logError("Erro ao incluir declaração no controle anual", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/annual-controls/:id/items/:code",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, code } = parseWithZod(annualDeclarationParamsSchema, req.params);
        const body = parseWithZod(updateAnnualDeclarationBodySchema, req.body);
        res.json(createSuccessResponse(await service.updateItem(id, code, body, actor(req))));
      } catch (err) {
        logError("Erro ao alterar declaração do controle anual", { err });
        next(err);
      }
    },
  );

  return router;
}
