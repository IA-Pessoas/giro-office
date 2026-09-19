import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { markRhNotificationReadBodySchema } from "../schemas/notification.schemas.js";
import { rhNotificationService } from "../services/rhNotificationService.js";

const router: ReturnType<typeof Router> = Router();

router.get(
  "/",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });
      const result = await rhNotificationService.list(organization_id, user_id);
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar notificações RH", { err });
      next(err);
    }
  },
);

router.put(
  "/read",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });
      const body = parseWithZod(markRhNotificationReadBodySchema, req.body);
      const result = await rhNotificationService.markRead({
        organization_id,
        user_id,
        ...(body.id ? { id: body.id } : {}),
        ...(body.request_id ? { request_id: body.request_id } : {}),
        ...(body.all ? { all: true } : {}),
      });
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao marcar notificações RH como lidas", { err });
      next(err);
    }
  },
);

export default router;
