import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskIntegrationRegularizeService } from "../services/TaskIntegrationRegularizeService.js";

const router: ReturnType<typeof Router> = Router();
const taskIntegrationRegularizeService = new TaskIntegrationRegularizeService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

router.post(
  "/integracao-tasksIntegration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { task_model_id, referring, referring_type } = req.body as Record<string, unknown>;
      const { user_id, organization_id } = requireAuthContext(req);

      if (
        typeof task_model_id !== "string" ||
        typeof referring !== "string" ||
        typeof referring_type !== "string"
      ) {
        throw new ServiceError(
          400,
          "Campos obrigatórios: task_model_id, referring, referring_type.",
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
  "/integracao-tasksIntegration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { integration_id } = req.body as Record<string, unknown>;
      const { user_id, organization_id } = requireAuthContext(req);

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
  "/integracao-tasksIntegration",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task_model_id = req.query.task_model_id as string | undefined;
      const { organization_id } = requireAuthContext(req);

      const result = await taskIntegrationRegularizeService.list(organization_id, task_model_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar vínculos integração Regularize", { err });
      next(err);
    }
  },
);

export { router as taskIntegrationRegularizeRoutes };
