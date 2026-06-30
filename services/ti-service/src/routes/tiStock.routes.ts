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
  createTiStockCategoryBodySchema,
  createTiStockEntryBodySchema,
  createTiStockExitBodySchema,
  createTiStockItemBodySchema,
  createTiStockLocationBodySchema,
  listTiStockItemsQuerySchema,
  stockCategoryIdParamsSchema,
  stockItemIdParamsSchema,
  stockLocationIdParamsSchema,
  updateTiStockCategoryBodySchema,
  updateTiStockItemBodySchema,
  updateTiStockLocationBodySchema,
} from "../schemas/tiStock.schemas.js";
import type { TiAuthContext } from "../services/tiRequestService.js";
import { TiStockService } from "../services/tiStockService.js";

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

export function createTiStockRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiStockService(prisma);

  router.get(
    "/items/list",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const query = parseWithZod(listTiStockItemsQuerySchema, request.query);
        const result = await service.listItems(context, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar itens de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/items/:id",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockItemIdParamsSchema, request.params);
        const result = await service.getItemById(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar item de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/items",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const body = parseWithZod(createTiStockItemBodySchema, request.body);
        const result = await service.createItem(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar item de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/items/:id",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockItemIdParamsSchema, request.params);
        const body = parseWithZod(updateTiStockItemBodySchema, request.body);
        const result = await service.updateItem(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar item de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/items/:id/entries",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockItemIdParamsSchema, request.params);
        const body = parseWithZod(createTiStockEntryBodySchema, request.body);
        const result = await service.createEntry(context, params.id, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao registrar entrada de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/items/:id/exits",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockItemIdParamsSchema, request.params);
        const body = parseWithZod(createTiStockExitBodySchema, request.body);
        const result = await service.createExit(context, params.id, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao registrar saida de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/categories/list",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const result = await service.listCategories(context);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar categorias de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/categories",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const body = parseWithZod(createTiStockCategoryBodySchema, request.body);
        const result = await service.createCategory(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar categoria de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/categories/:id",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockCategoryIdParamsSchema, request.params);
        const body = parseWithZod(updateTiStockCategoryBodySchema, request.body);
        const result = await service.updateCategory(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar categoria de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/locations/list",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const result = await service.listLocations(context);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar locais de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/locations",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const body = parseWithZod(createTiStockLocationBodySchema, request.body);
        const result = await service.createLocation(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar local de estoque de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/locations/:id",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(stockLocationIdParamsSchema, request.params);
        const body = parseWithZod(updateTiStockLocationBodySchema, request.body);
        const result = await service.updateLocation(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar local de estoque de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
