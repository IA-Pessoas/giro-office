import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskIntegrationRegularizeService } from "../services/taskIntegrationRegularizeService.js";

const router: ReturnType<typeof Router> = Router();
const taskIntegrationRegularizeService = new TaskIntegrationRegularizeService();

router.post(
  "/integration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { task_model_id, referring, referring_type } = req.body as Record<string, unknown>;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      if (
        typeof task_model_id !== "string" ||
        typeof referring !== "string" ||
        typeof referring_type !== "string"
      ) {
        throw new ServiceError(
          400,
          "Campos obrigatÃ³rios: task_model_id, referring, referring_type.",
        );
      }

      const result = await taskIntegrationRegularizeService.createLink({
        user_id,
        organization_id,
        task_model_id,
        referring,
        referring_type,
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
      const { integration_id } = req.body as Record<string, unknown>;
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

      if (typeof integration_id !== "string" || !integration_id) {
        throw new ServiceError(400, "integration_id é obrigatório.");
      }

      const result = await taskIntegrationRegularizeService.removeLink({
        user_id,
        organization_id,
        integration_id,
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
      const task_model_id = req.query.task_model_id as string | undefined;
      const { organization_id } = requireAuthenticatedRequestContext(req);

      const result = await taskIntegrationRegularizeService.list(organization_id, task_model_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar vínculos integração Regularize", { err });
      next(err);
    }
  },
);

export { router as taskIntegrationRegularizeRoutes };
