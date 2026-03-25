import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { TaskCrudService, type UpdateTaskCrudRequest } from "../services/TaskCrudService.js";

const router: ReturnType<typeof Router> = Router();
const taskCrudService = new TaskCrudService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

/** Campos opcionais vindos do JSON; chave ausente = não altera o valor no banco. */
function parseIntegracaoTaskUpdateBody(
  body: Record<string, unknown>,
): Omit<UpdateTaskCrudRequest, "user_id" | "organization_id" | "task_id"> {
  const patch: Omit<UpdateTaskCrudRequest, "user_id" | "organization_id" | "task_id"> = {};
  if ("name" in body) {
    patch.name = String(body.name ?? "");
  }
  if ("status" in body) {
    patch.status = String(body.status ?? "");
  }
  if ("department_id" in body) {
    patch.department_id = String(body.department_id ?? "");
  }
  if ("observations" in body) {
    patch.observations = String(body.observations ?? "");
  }
  if ("billing" in body) {
    patch.billing = String(body.billing ?? "");
  }
  if ("urgency" in body) {
    patch.urgency = String(body.urgency ?? "");
  }
  if ("responsible_id" in body) {
    patch.responsible_id = String(body.responsible_id ?? "");
  }
  if ("responsible2_id" in body) {
    const v = body.responsible2_id;
    patch.responsible2_id = v === null ? null : String(v);
  }
  if ("responsible3_id" in body) {
    const v = body.responsible3_id;
    patch.responsible3_id = v === null ? null : String(v);
  }
  if ("prevision_date" in body) {
    const v = body.prevision_date;
    if (v === null) {
      patch.prevision_date = null;
    } else if (v instanceof Date) {
      patch.prevision_date = v;
    } else if (typeof v === "string") {
      patch.prevision_date = v;
    } else {
      throw new ServiceError(400, "prevision_date deve ser string ISO, Date ou null.");
    }
  }
  return patch;
}

router.post(
  "/integracao-tasks",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { model_id, project_id, client_id, prospecting_status, observations, urgency } =
        req.body;
      const { user_id, organization_id } = requireAuthContext(req);

      if (
        !model_id ||
        !project_id ||
        !client_id ||
        prospecting_status === undefined ||
        observations === undefined ||
        urgency === undefined
      ) {
        throw new ServiceError(
          400,
          "Campos obrigatórios: model_id, project_id, client_id, prospecting_status, observations, urgency.",
        );
      }

      const result = await taskCrudService.createTask({
        user_id,
        organization_id,
        model_id,
        project_id,
        client_id,
        prospecting_status: String(prospecting_status),
        observations: String(observations),
        urgency: String(urgency),
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar tarefa", { err });
      next(err);
    }
  },
);

router.get(
  "/integracao-tasks",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthContext(req);
      const status = String(req.query.status ?? "Todos");
      const ref = String(req.query.ref ?? "");
      const ref_id = String(req.query.ref_id ?? "");
      const search = String(req.query.search ?? "");
      const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
      const limit = Math.max(
        1,
        Math.min(100, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20),
      );

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
  },
);

router.put(
  "/integracao-tasks",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as Record<string, unknown>;
      const rawTaskId = body.task_id;
      const { user_id, organization_id } = requireAuthContext(req);

      if (
        rawTaskId === undefined ||
        rawTaskId === null ||
        (typeof rawTaskId === "string" && rawTaskId.trim() === "")
      ) {
        throw new ServiceError(400, "task_id é obrigatório.");
      }

      const task_id = String(rawTaskId);
      const patch = parseIntegracaoTaskUpdateBody(body);

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
  },
);

router.get(
  "/integracao-task",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task_id = (req.body.task_id ?? req.query.task_id) as string;
      const { organization_id } = requireAuthContext(req);

      if (!task_id) {
        throw new ServiceError(400, "task_id é obrigatório (body ou query).");
      }

      const result = await taskCrudService.detailTask(task_id, organization_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar tarefa", { err });
      next(err);
    }
  },
);

router.delete(
  "/integracao-task",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task_id = (req.body.task_id ?? req.query.task_id) as string;
      const { user_id, organization_id } = requireAuthContext(req);

      if (!task_id) {
        throw new ServiceError(400, "task_id é obrigatório (body ou query).");
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
  },
);

export { router as taskCrudRoutes };
