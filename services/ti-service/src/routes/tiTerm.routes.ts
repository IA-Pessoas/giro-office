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
  createTiTermBodySchema,
  listTiTermsQuerySchema,
  signTiTermBodySchema,
  tiTermIdParamsSchema,
  updateTiTermBodySchema,
} from "../schemas/tiTerm.schemas.js";
import type { TiAuthContext } from "../services/tiRequestService.js";
import { TiTermService } from "../services/tiTermService.js";

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

export function createTiTermRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new TiTermService(prisma);

  router.get("/list", requireTiPermission(1), async (request, response, next) => {
    try {
      const context = getContext(request);
      const query = parseWithZod(listTiTermsQuerySchema, request.query);
      const result = await service.list(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar termos de TI", { err });
      next(err);
    }
  });

  router.get("/:id", requireTiPermission(1), async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiTermIdParamsSchema, request.params);
      const result = await service.getById(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao buscar termo de TI", { err });
      next(err);
    }
  });

  router.post("/", requireTiPermission(3), async (request, response, next) => {
    try {
      const context = getContext(request);
      const body = parseWithZod(createTiTermBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar termo de TI", { err });
      next(err);
    }
  });

  router.patch("/:id", requireTiPermission(3), async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiTermIdParamsSchema, request.params);
      const body = parseWithZod(updateTiTermBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar termo de TI", { err });
      next(err);
    }
  });

  router.patch("/:id/sign", requireTiPermission(1), async (request, response, next) => {
    try {
      const context = getContext(request);
      const params = parseWithZod(tiTermIdParamsSchema, request.params);
      const body = parseWithZod(signTiTermBodySchema, request.body);
      const result = await service.sign(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao assinar termo de TI", { err });
      next(err);
    }
  });

  return router;
}
