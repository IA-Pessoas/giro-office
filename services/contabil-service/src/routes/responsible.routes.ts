import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireContabilWritePermission } from "../middlewares/isAuthenticated.js";
import {
  createResponsibleBodySchema,
  responsibleClientIdParamsSchema,
  responsibleIdParamsSchema,
  updateResponsibleBodySchema,
} from "../schemas/responsible.schemas.js";
import type { ResponsibleService } from "../services/responsibleService.js";

export type ResponsibleRouteDeps = Pick<
  ResponsibleService,
  "create" | "update" | "getByClientId" | "delete"
>;

export function createResponsibleRoutes(service: ResponsibleRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/responsibles",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createResponsibleBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create(body, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar responsável contábil", { err });
        next(err);
      }
    },
  );

  router.put(
    "/responsibles/:id",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(responsibleIdParamsSchema, req.params);
        const body = parseWithZod(updateResponsibleBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.update(params.id, body, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar responsável contábil", { err });
        next(err);
      }
    },
  );

  router.get(
    "/responsibles/client/:clientId",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(responsibleClientIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.getByClientId(params.clientId, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar responsável contábil por cliente", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/responsibles/:id",
    isAuthenticated,
    requireContabilWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(responsibleIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.delete(params.id, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao deletar responsável contábil", { err });
        next(err);
      }
    },
  );

  return router;
}
