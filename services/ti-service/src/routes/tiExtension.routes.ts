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
  createTiExtensionBodySchema,
  listTiExtensionsQuerySchema,
  tiExtensionIdParamsSchema,
  updateTiExtensionBodySchema,
} from "../schemas/tiExtension.schemas.js";
import { TiExtensionService } from "../services/tiExtensionService.js";
import type { TiAuthContext } from "../services/tiRequestService.js";

function getContext(request: Request): TiAuthContext {
  if (!request.user_id || !request.organization_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return {
    userId: request.user_id,
    organizationId: request.organization_id,
    permission: Number(request.permission ?? 0),
  };
}

export function createTiExtensionRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiExtensionService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const query = parseWithZod(listTiExtensionsQuerySchema, request.query);
        const result = await service.list(context, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar ramais de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiExtensionIdParamsSchema, request.params);
        const result = await service.getById(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar ramal de TI", { err });
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
        const body = parseWithZod(createTiExtensionBodySchema, request.body);
        const result = await service.create(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar ramal de TI", { err });
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
        const params = parseWithZod(tiExtensionIdParamsSchema, request.params);
        const body = parseWithZod(updateTiExtensionBodySchema, request.body);
        const result = await service.update(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar ramal de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
