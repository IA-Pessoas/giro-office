import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
  requireIntegracaoRouteAccess,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { taskOperationalNotificationReadBodySchema } from "../schemas/taskOperationalNotification.schemas.js";
import { TaskOperationalNotificationService } from "../services/taskOperationalNotificationService.js";

const router: ReturnType<typeof Router> = Router();
const taskOperationalNotificationService = new TaskOperationalNotificationService();

router.get(
  "/notifications",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      requireIntegracaoRouteAccess("GET", "/task/notifications", {
        userId: user_id,
        organizationId: organization_id,
        level: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(
        createSuccessResponse(
          await taskOperationalNotificationService.list({ user_id, organization_id }),
        ),
      );
    } catch (err) {
      logError("Erro ao listar notificações operacionais", { err });
      next(err);
    }
  },
);

router.put(
  "/notifications/read",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const body = parseWithZod(taskOperationalNotificationReadBodySchema, req.body);
      requireIntegracaoRouteAccess("PUT", "/task/notifications/read", {
        userId: user_id,
        organizationId: organization_id,
        level: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(
        createSuccessResponse(
          await taskOperationalNotificationService.markRead({
            user_id,
            organization_id,
            notification_id: body.notification_id,
          }),
        ),
      );
    } catch (err) {
      logError("Erro ao marcar notificação operacional como lida", { err });
      next(err);
    }
  },
);

export { router as taskOperationalNotificationRoutes };
