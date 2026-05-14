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
  createRelationshipBodySchema,
  relationshipClientIdParamsSchema,
  relationshipIdParamsSchema,
  updateRelationshipBodySchema,
} from "../schemas/relationship.schemas.js";
import type { RelationshipService } from "../services/relationshipService.js";

export type RelationshipRouteDeps = Pick<
  RelationshipService,
  "create" | "update" | "getByClientId" | "delete"
>;

export function createRelationshipRoutes(
  service: RelationshipRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/relationships",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createRelationshipBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create(body, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar relacionamento contábil", { err });
        next(err);
      }
    },
  );

  router.put(
    "/relationships/:id",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(relationshipIdParamsSchema, req.params);
        const body = parseWithZod(updateRelationshipBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.update(params.id, body, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar relacionamento contábil", { err });
        next(err);
      }
    },
  );

  router.get(
    "/relationships/client/:clientId",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(relationshipClientIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.getByClientId(params.clientId, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar relacionamento contábil por cliente", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/relationships/:id",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(relationshipIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.delete(params.id, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao deletar relacionamento contábil", { err });
        next(err);
      }
    },
  );

  return router;
}
