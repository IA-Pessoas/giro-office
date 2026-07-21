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
  assignTiRequestBodySchema,
  createTiMessageBodySchema,
  createTiRequestBodySchema,
  listTiMessagesQuerySchema,
  listTiRequestsQuerySchema,
  tiRequestIdParamsSchema,
  updateTiRequestBodySchema,
  updateTiRequestStatusBodySchema,
} from "../schemas/tiRequest.schemas.js";
import { TiMessageService } from "../services/tiMessageService.js";
import { type TiAuthContext, TiRequestService } from "../services/tiRequestService.js";

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

export function createTiRequestRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const requestService = new TiRequestService(prisma);
  const messageService = new TiMessageService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const query = parseWithZod(listTiRequestsQuerySchema, request.query);
        const result = await requestService.list(context, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar chamados de TI", { err });
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
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const result = await requestService.getById(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao buscar chamado de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const body = parseWithZod(createTiRequestBodySchema, request.body);
        const result = await requestService.create(context, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar chamado de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const body = parseWithZod(updateTiRequestBodySchema, request.body);
        const result = await requestService.update(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar chamado de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/assign",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const body = parseWithZod(assignTiRequestBodySchema, request.body);
        const result = await requestService.assign(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atribuir chamado de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/status",
    requireTiPermission(TiPermissionLevel.Technician),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const body = parseWithZod(updateTiRequestStatusBodySchema, request.body);
        const result = await requestService.updateStatus(context, params.id, body);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar status de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id/messages",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const query = parseWithZod(listTiMessagesQuerySchema, request.query);
        const result = await messageService.list(context, params.id, query);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar mensagens de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/:id/messages",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const body = parseWithZod(createTiMessageBodySchema, request.body);
        const result = await messageService.create(context, params.id, body);

        response.status(201).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao criar mensagem de chamado de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
