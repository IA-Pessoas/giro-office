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
  getRhPermissionLevel,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  createRhLifeObjectiveBodySchema,
  createRhLifeProjectBodySchema,
  rhLifeObjectiveParamsSchema,
  rhLifeProjectIdParamSchema,
  rhLifeProjectQuerySchema,
  updateRhLifeObjectiveBodySchema,
  updateRhLifeProjectBodySchema,
} from "../schemas/rhLifeProject.schemas.js";
import { RhLifeProjectService } from "../services/rhLifeProjectService.js";

export function createRhLifeProjectRouter(
  service = new RhLifeProjectService(),
): ReturnType<typeof Router> {
  const router = Router();

  router.use(isAuthenticated, requireRhPermission(RH_SELF_SERVICE_PERMISSION));

  function getContext(request: Request) {
    const context = requireAuthenticatedRequestContext(request, { statusCode: 400 });
    return {
      actorUserId: context.user_id,
      organizationId: context.organization_id,
      rhPermission: getRhPermissionLevel(request),
    };
  }

  router.get("/", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(rhLifeProjectQuerySchema, request.query);
      const context = getContext(request);
      response
        .status(200)
        .json(
          createSuccessResponse(
            await service.get({ ...context, targetUserId: query.user_id }, query.year),
          ),
        );
    } catch (err) {
      logError("Erro ao consultar Projeto de Vida", { err });
      next(err);
    }
  });

  router.post("/", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createRhLifeProjectBodySchema, request.body);
      const context = getContext(request);
      response
        .status(201)
        .json(
          createSuccessResponse(
            await service.create({ ...context, targetUserId: body.target_user_id }, body.year),
          ),
        );
    } catch (err) {
      logError("Erro ao criar Projeto de Vida", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const { id } = parseWithZod(rhLifeProjectIdParamSchema, request.params);
      const changes = parseWithZod(updateRhLifeProjectBodySchema, request.body);
      response
        .status(200)
        .json(createSuccessResponse(await service.update(getContext(request), id, changes)));
    } catch (err) {
      logError("Erro ao atualizar Projeto de Vida", { err });
      next(err);
    }
  });

  router.post(
    "/:id/objectives",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(rhLifeProjectIdParamSchema, request.params);
        const objective = parseWithZod(createRhLifeObjectiveBodySchema, request.body);
        response
          .status(201)
          .json(
            createSuccessResponse(
              await service.createObjective(getContext(request), id, objective),
            ),
          );
      } catch (err) {
        logError("Erro ao criar objetivo do Projeto de Vida", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/objectives/:objectiveId",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id, objectiveId } = parseWithZod(rhLifeObjectiveParamsSchema, request.params);
        const changes = parseWithZod(updateRhLifeObjectiveBodySchema, request.body);
        response
          .status(200)
          .json(
            createSuccessResponse(
              await service.updateObjective(getContext(request), id, objectiveId, changes),
            ),
          );
      } catch (err) {
        logError("Erro ao atualizar objetivo do Projeto de Vida", { err });
        next(err);
      }
    },
  );

  return router;
}

const rhLifeProjectRouter: ReturnType<typeof Router> = createRhLifeProjectRouter();

export default rhLifeProjectRouter;
