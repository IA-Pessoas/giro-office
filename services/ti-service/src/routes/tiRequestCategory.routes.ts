import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import {
  createTiRequestCategoryBodySchema,
  listTiRequestCategoriesQuerySchema,
  tiRequestCategoryIdParamsSchema,
  updateTiRequestCategoryBodySchema,
} from "../schemas/tiRequestCategory.schemas.js";
import { TiRequestCategoryService } from "../services/tiRequestCategoryService.js";

function requireOrganizationId(organizationId: string | undefined): string {
  if (!organizationId) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return organizationId;
}

export function createTiRequestCategoryRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiRequestCategoryService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Viewer),
    async (request, response, next) => {
      try {
        const organizationId = requireOrganizationId(request.organization_id);
        const query = parseWithZod(listTiRequestCategoriesQuerySchema, request.query);
        const result = await service.list({ organizationId }, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar categorias de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const organizationId = requireOrganizationId(request.organization_id);
        const body = parseWithZod(createTiRequestCategoryBodySchema, request.body);
        const result = await service.create({ organizationId }, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar categoria de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const organizationId = requireOrganizationId(request.organization_id);
        const params = parseWithZod(tiRequestCategoryIdParamsSchema, request.params);
        const body = parseWithZod(updateTiRequestCategoryBodySchema, request.body);
        const result = await service.update({ organizationId }, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar categoria de chamado de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
