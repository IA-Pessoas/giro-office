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
  createTiInventoryLocationBodySchema,
  tiInventoryLocationIdParamsSchema,
  updateTiInventoryLocationBodySchema,
} from "../schemas/tiInventoryLocation.schemas.js";
import { TiInventoryLocationService } from "../services/tiInventoryLocationService.js";

function getOrganizationId(request: Request): string {
  if (!request.organization_id) {
    throw new ServiceError(401, "Autenticacao obrigatoria.");
  }

  return request.organization_id;
}

export function createTiInventoryLocationRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiInventoryLocationService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const organizationId = getOrganizationId(request);
        const result = await service.list({ organizationId });

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar locais de inventario de TI", { err });
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
        const body = parseWithZod(createTiInventoryLocationBodySchema, request.body);
        const result = await service.create({ organizationId }, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar local de inventario de TI", { err });
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
        const params = parseWithZod(tiInventoryLocationIdParamsSchema, request.params);
        const body = parseWithZod(updateTiInventoryLocationBodySchema, request.body);
        const result = await service.update({ organizationId }, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar local de inventario de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
