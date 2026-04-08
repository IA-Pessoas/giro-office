import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskDependentService } from "../services/taskDependentService.js";

const router: ReturnType<typeof Router> = Router();
const taskDependentService = new TaskDependentService();

router.post("/model/dependent", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { task_model_id, dependent_id, wait, observation } = req.body;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_model_id || !dependent_id || wait === undefined || observation === undefined) {
      throw new ServiceError(400, "Campos obrigatÃ³rios: task_model_id, dependent_id, wait, observation.");
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
});

router.get("/model/dependent", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_model_id = (req.body.task_model_id ?? req.query.task_model_id) as string;
    const { organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_model_id) {
      throw new ServiceError(400, "task_model_id Ã© obrigatÃ³rio (body ou query).");
    }

    const result = await taskDependentService.listDependents(task_model_id, organization_id);
    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar dependentes", { err });
    next(err);
  }
});

router.delete("/model/dependent", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = (req.body.id ?? req.query.id) as string;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!id) {
      throw new ServiceError(400, "id Ã© obrigatÃ³rio (body ou query).");
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
});

export { router as taskDependentRoutes };
