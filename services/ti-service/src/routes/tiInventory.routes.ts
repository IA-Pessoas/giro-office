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
  assignTiInventoryUserBodySchema,
  createTiInventoryBodySchema,
  listTiInventoryQuerySchema,
  returnTiInventoryBodySchema,
  tiInventoryIdParamsSchema,
  updateTiInventoryBodySchema,
} from "../schemas/tiInventory.schemas.js";
import { TiInventoryService } from "../services/tiInventoryService.js";
import type { TiAuthContext } from "../services/tiRequestService.js";

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

export function createTiInventoryRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiInventoryService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const query = parseWithZod(listTiInventoryQuerySchema, request.query);
        const result = await service.list(context, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar inventario de TI", { err });
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
        const params = parseWithZod(tiInventoryIdParamsSchema, request.params);
        const result = await service.getById(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar ativo de inventario de TI", { err });
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
        const body = parseWithZod(createTiInventoryBodySchema, request.body);
        const result = await service.create(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar ativo de inventario de TI", { err });
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
        const params = parseWithZod(tiInventoryIdParamsSchema, request.params);
        const body = parseWithZod(updateTiInventoryBodySchema, request.body);
        const result = await service.update(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar ativo de inventario de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/assign-user",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiInventoryIdParamsSchema, request.params);
        const body = parseWithZod(assignTiInventoryUserBodySchema, request.body);
        const result = await service.assignUser(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atribuir ativo de inventario de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/return",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiInventoryIdParamsSchema, request.params);
        const body = parseWithZod(returnTiInventoryBodySchema, request.body);
        const result = await service.returnAsset(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao devolver ativo de inventario de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
