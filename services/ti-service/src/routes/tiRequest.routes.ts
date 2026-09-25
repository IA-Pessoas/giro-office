import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { createPhotoUploadMiddleware, validateUploadFileSignature } from "@workspace/shared/upload";
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
import {
  isTiRequestImageObjectPath,
  type TiRequestImageStorage,
} from "../services/tiRequestImageStorage.js";
import { type TiAuthContext, TiRequestService } from "../services/tiRequestService.js";

const upload = createPhotoUploadMiddleware();

function getContext(request: Request): TiAuthContext {
  if (!request.user_id || !request.organization_id) {
    throw new ServiceError(401, "Autenticação obrigatória.");
  }

  return {
    userId: request.user_id,
    organizationId: request.organization_id,
    permission: Number(request.permission ?? 0),
    isOrganizationOwner: request.user_type === "owner",
  };
}

async function withSignedAttachment(
  message: unknown,
  context: TiAuthContext,
  requestId: string,
  requestImageStorage: TiRequestImageStorage,
): Promise<unknown> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return message;
  }

  const record = message as Record<string, unknown>;
  const objectPath = record.attachment;

  if (objectPath === undefined || objectPath === null) {
    return message;
  }

  if (
    typeof objectPath !== "string" ||
    !isTiRequestImageObjectPath(objectPath, context.organizationId, requestId)
  ) {
    return { ...record, attachment: null };
  }

  return {
    ...record,
    attachment: await requestImageStorage.createSignedAccessUrl(objectPath),
  };
}

export function createTiRequestRoutes(
  prisma: PrismaClient,
  requestImageStorage: TiRequestImageStorage,
): Router {
  const router = Router();
  const requestService = new TiRequestService(prisma);
  const messageService = new TiMessageService(prisma);

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Viewer),
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
    "/:id/transfer-candidates",
    requireTiPermission(TiPermissionLevel.Requester),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const result = await requestService.listTransferCandidates(context, params.id);

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar candidatos para transferencia de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id",
    requireTiPermission(TiPermissionLevel.Viewer),
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
    requireTiPermission(TiPermissionLevel.Viewer),
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
    requireTiPermission(TiPermissionLevel.Requester),
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
    requireTiPermission(TiPermissionLevel.Viewer),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const query = parseWithZod(listTiMessagesQuerySchema, request.query);
        const result = await messageService.list(context, params.id, query);
        const messages = await Promise.all(
          result.map((message) =>
            withSignedAttachment(message, context, params.id, requestImageStorage),
          ),
        );

        response.status(200).json(createSuccessResponse(messages));
      } catch (err: unknown) {
        logError("Erro ao listar mensagens de chamado de TI", { err });
        next(err);
      }
    },
  );

  router.post(
    "/:id/messages",
    requireTiPermission(TiPermissionLevel.Viewer),
    upload.single("file"),
    async (request, response, next) => {
      try {
        const context = getContext(request);
        const params = parseWithZod(tiRequestIdParamsSchema, request.params);
        const body = parseWithZod(createTiMessageBodySchema, request.body);
        let attachment: string | undefined;

        if (request.file) {
          await messageService.assertRequestAccess(context, params.id);
          validateUploadFileSignature(request.file);
          const objectPath = await requestImageStorage.upload({
            organizationId: context.organizationId,
            requestId: params.id,
            file: {
              buffer: request.file.buffer,
              mimetype: request.file.mimetype as "image/jpeg" | "image/png" | "image/webp",
            },
          });

          if (!isTiRequestImageObjectPath(objectPath, context.organizationId, params.id)) {
            throw new ServiceError(500, "Armazenamento da imagem retornou uma chave invalida.");
          }

          attachment = objectPath;
        }

        const result = await messageService.create(context, params.id, {
          ...body,
          ...(attachment ? { attachment } : {}),
        });
        const message = await withSignedAttachment(result, context, params.id, requestImageStorage);

        response.status(201).json(createSuccessResponse(message));
      } catch (err: unknown) {
        logError("Erro ao criar mensagem de chamado de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
