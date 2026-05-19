import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission } from "../middlewares/requireTiPermission.js";
import {
  createTiPasswordBodySchema,
  listTiPasswordsQuerySchema,
  tiPasswordIdParamsSchema,
  updateTiPasswordBodySchema,
} from "../schemas/tiPassword.schemas.js";
import { TiPasswordService } from "../services/tiPasswordService.js";
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

export function createTiPasswordRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiPasswordService(prisma);

  router.get("/list", requireTiPermission(1), async (request, response, next) => {
    try {
      const context = getContext(request);
      const query = parseWithZod(listTiPasswordsQuerySchema, request.query);
      const result = await service.list(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar senhas de TI", { err });
      next(err);
    }
  });

  router.get("/:id", requireTiPermission(1), async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiPasswordIdParamsSchema, request.params);
      const result = await service.getById(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao buscar senha de TI", { err });
      next(err);
    }
  });

  router.post("/", requireTiPermission(3), async (request, response, next) => {
    try {
      const context = getContext(request);
      const body = parseWithZod(createTiPasswordBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar senha de TI", { err });
      next(err);
    }
  });

  router.patch("/:id", requireTiPermission(3), async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiPasswordIdParamsSchema, request.params);
      const body = parseWithZod(updateTiPasswordBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar senha de TI", { err });
      next(err);
    }
  });

  return router;
}
