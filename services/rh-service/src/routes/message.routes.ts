import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
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

const router: ReturnType<typeof Router> = Router();
const messageService = new MessageService();

router.post(
  "/",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const body = parseWithZod(createMessageBodySchema, req.body);
      const canUseWorkflowMessages = canUseRhWorkflowMessages(req);
      if (!canUseWorkflowMessages && body.type !== "Message") {
        throw new ServiceError(403, "RH Visualizador pode enviar somente mensagens.");
      }

      const result = await messageService.create({
        organization_id: organizationId,
        sender_user_id: userId,
        request_id: body.request_id,
        message: body.message,
        type: body.type,
        ...(body.attachment !== undefined ? { attachment: body.attachment } : {}),
        can_manage_rh: canManageRh(req),
        can_use_workflow_messages: canUseWorkflowMessages,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
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
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const query = parseWithZod(listMessagesQuerySchema, req.query);

      const result = await messageService.listByRequest({
        organization_id: organizationId,
        user_id: userId,
        request_id: query.requestId,
        can_manage_rh: canManageRh(req),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar mensagens do chamado RH", { err });
      next(err);
    }
  },
);

export default router;
