import {
  createSuccessResponse,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { Request } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  taskBillingIdParamSchema,
  updateTaskBillingBodySchema,
} from "../schemas/taskBilling.schemas.js";
import type { CommercialTaskBillingService } from "../services/taskBillingService.js";

export type CommercialTaskBillingRouteDeps = Pick<CommercialTaskBillingService, "list" | "update">;

function authContext(req: Request): {
  user_id: string;
  organization_id: string;
  audit_correlation_id?: string;
} {
  const context = requireAuthenticatedRequestContext(req, {
    statusCode: 401,
    userIdMessage: "Contexto de autenticação inválido.",
    organizationIdMessage: "Contexto de autenticação inválido.",
  });
  return {
    ...context,
    ...(req.requestId ? { audit_correlation_id: req.requestId } : {}),
  };
}

export function createTaskBillingRoutes(
  service: CommercialTaskBillingRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get("/", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.list(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.put("/:taskId", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const { taskId } = parseWithZod(taskBillingIdParamSchema, req.params);
      const body = parseWithZod(updateTaskBillingBodySchema, req.body);
      const result = await service.update({
        user_id,
        organization_id,
        audit_correlation_id,
        task_id: taskId,
        ...body,
      });
      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
