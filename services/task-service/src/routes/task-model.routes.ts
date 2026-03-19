import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { TaskModelService } from "../services/TaskModelService.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";

const router: ReturnType<typeof Router> = Router();
const taskModelService = new TaskModelService();

router.post("/integracao-tasksModel", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      department_id,
      responsible_id,
      responsible2_id,
      responsible3_id,
      observations,
      billing,
      prevision,
      type,
    } = req.body;
    const my_id = req.user_id!;
    const organization_id = req.organization_id!;

    if (!name || !department_id || !responsible_id || !billing || prevision === undefined) {
      throw new ServiceError(
        400,
        "Campos obrigatórios: name, department_id, responsible_id, billing, prevision.",
      );
    }

    const result = await taskModelService.createModel({
      my_id,
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

router.get("/integracao-taskModel", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const organization_id = req.organization_id!;

    if (!task_id) {
      throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    }

    const result = await taskModelService.detailModel(task_id, organization_id);
    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao buscar task model", { err });
    next(err);
  }
});

router.put("/integracao-tasksModel", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      task_id,
      name,
      department_id,
      responsible_id,
      responsible2_id,
      responsible3_id,
      observations,
      billing,
      prevision,
      type,
    } = req.body;
    const my_id = req.user_id!;
    const organization_id = req.organization_id!;

    if (!task_id || !name || !department_id || !responsible_id || !billing || prevision === undefined) {
      throw new ServiceError(
        400,
        "Campos obrigatórios: task_id, name, department_id, responsible_id, billing, prevision.",
      );
    }

    const result = await taskModelService.updateModel({
      my_id,
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

router.get("/integracao-tasksModel", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let { type, billing } = req.body;
    if (type === undefined) {
      type = req.query.type;
      billing = req.query.billing;
    }

    const organization_id = req.organization_id!;

    if (!type || !billing) {
      throw new ServiceError(400, "type e billing são obrigatórios (body ou query).");
    }

    const result = await taskModelService.listModel(
      String(type),
      String(billing),
      organization_id,
    );

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao listar task models", { err });
    next(err);
  }
});

router.delete("/integracao-taskModel", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task_id = (req.body.task_id ?? req.query.task_id) as string;
    const my_id = req.user_id!;
    const organization_id = req.organization_id!;

    if (!task_id) {
      throw new ServiceError(400, "task_id é obrigatório (body ou query).");
    }

    const result = await taskModelService.deleteModel({
      task_id,
      my_id,
      organization_id,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao excluir task model", { err });
    next(err);
  }
});

export { router as taskModelRoutes };
