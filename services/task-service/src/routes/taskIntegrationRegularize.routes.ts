import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { nodeDeps } from "../nodeDeps.js";
import {
  taskIntegrationRegularizeBodySchema,
  taskIntegrationRegularizeDeleteBodySchema,
  taskIntegrationRegularizeListQuerySchema,
} from "../schemas/taskIntegrationRegularize.schemas.js";
import { TaskIntegrationRegularizeService } from "../services/taskIntegrationRegularizeService.js";

const router: ReturnType<typeof Router> = Router();
const taskIntegrationRegularizeService = new TaskIntegrationRegularizeService(
  nodeDeps.prisma,
  nodeDeps.audit,
);

router.post(
  "/integration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { task_model_id, referring, referring_type } = parseWithZod(
        taskIntegrationRegularizeBodySchema,
        req.body,
      );
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await taskIntegrationRegularizeService.createLink({
        user_id,
        organization_id,
        task_model_id,
        referring,
        referring_type,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar vínculo integração Regularize", { err });
      next(err);
    }
  },
);

router.delete(
  "/integration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { integration_id } = parseWithZod(taskIntegrationRegularizeDeleteBodySchema, req.body);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await taskIntegrationRegularizeService.removeLink({
        user_id,
        organization_id,
        integration_id,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao remover vínculo integração Regularize", { err });
      next(err);
    }
  },
);

router.get(
  "/integration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { task_model_id } = parseWithZod(taskIntegrationRegularizeListQuerySchema, req.query);
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      const result = await taskIntegrationRegularizeService.list(organization_id, task_model_id, {
        userId: user_id,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar vínculos integração Regularize", { err });
      next(err);
    }
  },
);

export { router as taskIntegrationRegularizeRoutes };
