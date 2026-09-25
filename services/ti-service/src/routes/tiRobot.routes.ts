import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import {
  createTiRobotBodySchema,
  createTiRobotRunBodySchema,
  listTiRobotRunsQuerySchema,
  listTiRobotsQuerySchema,
  tiRobotIdParamsSchema,
  updateTiRobotBodySchema,
} from "../schemas/tiRobot.schemas.js";
import type { TiAuthContext } from "../services/tiRequestService.js";
import { TiRobotService } from "../services/tiRobotService.js";

function getContext(request: Request): TiAuthContext {
  if (!request.user_id || !request.organization_id) {
    throw new ServiceError(401, "Autenticação obrigatória.");
  }

  return {
    userId: request.user_id,
    organizationId: request.organization_id,
    permission: Number(request.permission ?? 0),
  };
}

export function createTiRobotRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiRobotService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const query = parseWithZod(listTiRobotsQuerySchema, request.query);
        const result = await service.list(context, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar robos de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRobotIdParamsSchema, request.params);
        const result = await service.getById(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar robo de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const body = parseWithZod(createTiRobotBodySchema, request.body);
        const result = await service.create(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar robo de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRobotIdParamsSchema, request.params);
        const body = parseWithZod(updateTiRobotBodySchema, request.body);
        const result = await service.update(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar robo de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/:id/runs",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRobotIdParamsSchema, request.params);
        const body = parseWithZod(createTiRobotRunBodySchema, request.body);
        const result = await service.createRun(context, params.id, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao registrar execucao de robo de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id/runs/list",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRobotIdParamsSchema, request.params);
        const query = parseWithZod(listTiRobotRunsQuerySchema, request.query);
        const result = await service.listRuns(context, params.id, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar execucoes de robo de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
