import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoTaskCreateBodySchema } from "../schemas/integracaoTaskCreate.schema.js";
import { integracaoTaskUpdateBodySchema } from "../schemas/integracaoTaskUpdate.schema.js";
import { taskListQuerySchema } from "../schemas/taskList.schemas.js";
import { TaskCrudService } from "../services/taskCrudService.js";

const router: ReturnType<typeof Router> = Router();
const taskCrudService = new TaskCrudService();

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const body = parseWithZod(integracaoTaskCreateBodySchema, req.body);

    const result = await taskCrudService.createTask({
      user_id,
      organization_id,
      model_id: body.model_id,
      project_id: body.project_id,
      client_id: body.client_id,
      prospecting_status: body.prospecting_status,
      name: body.name,
      status: body.status,
      department_id: body.department_id,
      observations: body.observations,
      billing: body.billing,
      urgency: body.urgency,
      responsible_id: body.responsible_id,
      responsible2_id: body.responsible2_id,
      responsible3_id: body.responsible3_id,
      prevision_date: body.prevision_date,
    });

    res.status(201).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar tarefa", { err });
    next(err);
  }
});

router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organization_id } = requireAuthenticatedRequestContext(req);
    const query = parseWithZod(taskListQuerySchema, req.query);

    const result = await taskCrudService.listTasks({
      organization_id,
      ...query,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar tarefas", { err });
    next(err);
  }
});

router.put("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const parsed = parseWithZod(integracaoTaskUpdateBodySchema, req.body);
    const { task_id, ...patch } = parsed;

    const result = await taskCrudService.updateTask({
      user_id,
      organization_id,
      task_id,
      ...patch,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar tarefa", { err });
    next(err);
  }
});

router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const { organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_id) {
      throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
    }

    const result = await taskCrudService.detailTask(task_id, organization_id);
    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao detalhar tarefa", { err });
    next(err);
  }
});

router.delete("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_id) {
      throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
    }

    const result = await taskCrudService.deleteTask({
      task_id,
      user_id,
      organization_id,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao excluir tarefa", { err });
    next(err);
  }
});

export { router as taskCrudRoutes };
