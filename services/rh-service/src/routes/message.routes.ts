import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { createPhotoUploadMiddleware, validateUploadFileSignature } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  canManageRh,
  canUseRhWorkflowMessages,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { createMessageBodySchema, listMessagesQuerySchema } from "../schemas/message.schemas.js";
import { MessageService } from "../services/messageService.js";
import {
  isRhRequestMessageObjectPath,
  RH_REQUEST_MESSAGE_MIME_TYPES,
  type RhRequestMessageAttachmentStorage,
} from "../services/rhRequestMessageStorage.js";

function withSignedAttachment(
  message: unknown,
  organizationId: string,
  requestId: string,
  storage: RhRequestMessageAttachmentStorage,
): Promise<unknown> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return Promise.resolve(message);
  }

  const record = message as Record<string, unknown>;
  const objectPath = record.attachment;
  if (objectPath === undefined || objectPath === null) {
    return Promise.resolve(message);
  }

  if (
    typeof objectPath !== "string" ||
    !isRhRequestMessageObjectPath(objectPath, organizationId, requestId)
  ) {
    // Anexos legados ou URLs públicas ficam em quarentena: nunca devolvemos o valor bruto.
    return Promise.resolve({ ...record, attachment: null });
  }

  return storage.createSignedAccessUrl(objectPath).then((signedUrl) => ({
    ...record,
    attachment: signedUrl,
  }));
}

export function createMessageRoutes(options: {
  attachmentStorage: RhRequestMessageAttachmentStorage;
}): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const messageService = new MessageService();
  const upload = createPhotoUploadMiddleware({
    maxSizeBytes: 10 * 1024 * 1024,
    allowedMimeTypes: [...RH_REQUEST_MESSAGE_MIME_TYPES],
  });

  router.post(
    "/",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      let uploadedObjectPath: string | undefined;
      try {
        const organizationId = req.organization_id;
        const userId = req.user_id;
        if (!organizationId) throw new ServiceError(400, "organization_id é obrigatório.");
        if (!userId) throw new ServiceError(400, "user_id é obrigatório.");

        const body = parseWithZod(createMessageBodySchema, req.body);
        const canManage = canManageRh(req);
        const canUseWorkflowMessages = canUseRhWorkflowMessages(req);
        if (!canUseWorkflowMessages && body.type === "Solution") {
          throw new ServiceError(403, "RH Visualizador pode enviar somente mensagens.");
        }
        await messageService.assertCanCreate({
          organization_id: organizationId,
          sender_user_id: userId,
          request_id: body.request_id,
          type: body.type,
          can_manage_rh: canManage,
          can_use_rh_workflow_messages: canUseWorkflowMessages,
        });

        let attachment = body.attachment;
        if (req.file) {
          validateUploadFileSignature(req.file);
          const objectPath = await options.attachmentStorage.upload({
            organizationId,
            requestId: body.request_id,
            file: {
              buffer: req.file.buffer,
              mimetype: req.file.mimetype as (typeof RH_REQUEST_MESSAGE_MIME_TYPES)[number],
            },
          });
          if (!isRhRequestMessageObjectPath(objectPath, organizationId, body.request_id)) {
            throw new ServiceError(500, "Armazenamento retornou uma chave de anexo inválida.");
          }
          uploadedObjectPath = objectPath;
          attachment = objectPath;
        }

        const result = await messageService.create({
          organization_id: organizationId,
          sender_user_id: userId,
          request_id: body.request_id,
          message: body.message,
          type: body.type,
          ...(attachment !== undefined ? { attachment } : {}),
          can_manage_rh: canManage,
          can_use_rh_workflow_messages: canUseWorkflowMessages,
        });

        const responseMessage = await withSignedAttachment(
          result,
          organizationId,
          body.request_id,
          options.attachmentStorage,
        );
        res.status(200).json(createSuccessResponse(responseMessage));
      } catch (err) {
        if (uploadedObjectPath && options.attachmentStorage.remove) {
          await options.attachmentStorage.remove(uploadedObjectPath).catch((cleanupError) => {
            logError("Erro ao remover anexo órfão de mensagem RH", {
              err: cleanupError,
              objectPath: uploadedObjectPath,
            });
          });
        }
        logError("Erro ao criar mensagem do chamado RH", { err });
        next(err);
      }
    },
  );

  router.get(
    "/",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const organizationId = req.organization_id;
        const userId = req.user_id;
        if (!organizationId) throw new ServiceError(400, "organization_id é obrigatório.");
        if (!userId) throw new ServiceError(400, "user_id é obrigatório.");

        const query = parseWithZod(listMessagesQuerySchema, req.query);
        const result = await messageService.listByRequest({
          organization_id: organizationId,
          user_id: userId,
          request_id: query.requestId,
          can_manage_rh: canManageRh(req),
        });
        const messages = await Promise.all(
          result.map((message) =>
            withSignedAttachment(
              message,
              organizationId,
              query.requestId,
              options.attachmentStorage,
            ),
          ),
        );
        res.status(200).json(createSuccessResponse(messages));
      } catch (err) {
        logError("Erro ao listar mensagens do chamado RH", { err });
        next(err);
      }
    },
  );

  return router;
}
