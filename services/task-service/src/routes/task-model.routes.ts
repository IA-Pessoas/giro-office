import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskModelService } from "../services/TaskModelService.js";

const router: ReturnType<typeof Router> = Router();
const taskModelService = new TaskModelService();

router.post("/model", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, department_id, responsible_id, responsible2_id, responsible3_id, observations, billing, prevision, type } = req.body;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!name || !department_id || !responsible_id || !billing || prevision === undefined) {
      throw new ServiceError(400, "Campos obrigatÃ³rios: name, department_id, responsible_id, billing, prevision.");
    }

    const result = await taskModelService.createModel({
      user_id,
      organization_id,
      name,
      department_id,
      responsible_id,
      responsible2_id: responsible2_id ?? null,
      responsible3_id: responsible3_id ?? null,
      observations: observations ?? null,
      billing,
      prevision: Number(prevision),
      type: type ?? null,
    });

    res.status(201).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar task model", { err });
    next(err);
  }
});

router.get("/model", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const { organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_id) {
      throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
    }

    const result = await taskModelService.detailModel(task_id, organization_id);
    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao buscar task model", { err });
    next(err);
  }
});

router.put("/model", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { task_id, name, department_id, responsible_id, responsible2_id, responsible3_id, observations, billing, prevision, type } = req.body;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_id || !name || !department_id || !responsible_id || !billing || prevision === undefined) {
      throw new ServiceError(400, "Campos obrigatÃ³rios: task_id, name, department_id, responsible_id, billing, prevision.");
    }

    const result = await taskModelService.updateModel({
      user_id,
      organization_id,
      task_id,
      name,
      department_id,
      responsible_id,
      responsible2_id: responsible2_id ?? null,
      responsible3_id: responsible3_id ?? null,
      observations: observations ?? null,
      billing,
      prevision: Number(prevision),
      type: type ?? null,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar task model", { err });
    next(err);
  }
});

router.get("/model/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { type, billing } = req.body;
    if (type === undefined) {
      type = req.query.type;
      billing = req.query.billing;
    }

    const { organization_id } = requireAuthenticatedRequestContext(req);

    if (!type || !billing) {
      throw new ServiceError(400, "type e billing sÃ£o obrigatÃ³rios (body ou query).");
    }

    const result = await taskModelService.listModel(String(type), String(billing), organization_id);

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar task models", { err });
    next(err);
  }
});

router.delete("/model", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);

    if (!task_id) {
      throw new ServiceError(400, "task_id Ã© obrigatÃ³rio (body ou query).");
    }

    const result = await taskModelService.deleteModel({
      task_id,
      user_id,
      organization_id,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao excluir task model", { err });
    next(err);
  }
});

export { router as taskModelRoutes };
