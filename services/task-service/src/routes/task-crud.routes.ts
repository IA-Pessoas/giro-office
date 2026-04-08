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
import { integracaoTaskCreateBodySchema } from "../schemas/integracao-task-create.schema.js";
import { integracaoTaskUpdateBodySchema } from "../schemas/integracao-task-update.schema.js";
import { TaskCrudService } from "../services/TaskCrudService.js";

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
      observations: body.observations,
      urgency: body.urgency,
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
    const status = String(req.query.status ?? "Todos");
    const ref = String(req.query.ref ?? "");
    const ref_id = String(req.query.ref_id ?? "");
    const search = String(req.query.search ?? "");
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.max(1, Math.min(100, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));

    const result = await taskCrudService.listTasks({
      organization_id,
      status,
      ref,
      ref_id,
      search,
      page,
      limit,
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
