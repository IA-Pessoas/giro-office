import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskDependentService } from "../services/TaskDependentService.js";

const router: ReturnType<typeof Router> = Router();
const taskDependentService = new TaskDependentService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

router.post(
  "/integracao-tasksModel-dependent",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { task_model_id, dependent_id, wait, observation } = req.body;
      const { user_id, organization_id } = requireAuthContext(req);

      if (!task_model_id || !dependent_id || wait === undefined || observation === undefined) {
        throw new ServiceError(
          400,
          "Campos obrigatórios: task_model_id, dependent_id, wait, observation.",
        );
      }

      const result = await taskDependentService.addDependent({
        user_id,
        organization_id,
        task_model_id,
        dependent_id,
        wait: Boolean(wait),
        observation: String(observation),
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao adicionar dependente", { err });
      next(err);
    }
  },
);

router.get(
  "/integracao-tasksModel-dependent",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task_model_id = (req.body.task_model_id ?? req.query.task_model_id) as string;
      const { organization_id } = requireAuthContext(req);

      if (!task_model_id) {
        throw new ServiceError(400, "task_model_id é obrigatório (body ou query).");
      }

      const result = await taskDependentService.listDependents(task_model_id, organization_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar dependentes", { err });
      next(err);
    }
  },
);

router.delete(
  "/integracao-taskModel-dependent",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = (req.body.id ?? req.query.id) as string;
      const { user_id, organization_id } = requireAuthContext(req);

      if (!id) {
        throw new ServiceError(400, "id é obrigatório (body ou query).");
      }

      const result = await taskDependentService.deleteDependent({
        id,
        user_id,
        organization_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao excluir dependente", { err });
      next(err);
    }
  },
);

export { router as taskDependentRoutes };
