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
  createTiInventoryCategoryBodySchema,
  tiInventoryCategoryIdParamsSchema,
  updateTiInventoryCategoryBodySchema,
} from "../schemas/tiInventoryCategory.schemas.js";
import { TiInventoryCategoryService } from "../services/tiInventoryCategoryService.js";

function getOrganizationId(request: Request): string {
  if (!request.organization_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return request.organization_id;
}

export function createTiInventoryCategoryRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiInventoryCategoryService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const organizationId = getOrganizationId(request);
        const result = await service.list({ organizationId });

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar categorias de inventario de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const organizationId = getOrganizationId(request);
        const body = parseWithZod(createTiInventoryCategoryBodySchema, request.body);
        const result = await service.create({ organizationId }, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar categoria de inventario de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const organizationId = getOrganizationId(request);
        const params = parseWithZod(tiInventoryCategoryIdParamsSchema, request.params);
        const body = parseWithZod(updateTiInventoryCategoryBodySchema, request.body);
        const result = await service.update({ organizationId }, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar categoria de inventario de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
