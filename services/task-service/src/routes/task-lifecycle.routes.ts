import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoTaskCompleteRequestBodySchema } from "../schemas/integracao-task-complete-request-body.schema.js";
import { integracaoTaskConclusionBodySchema } from "../schemas/integracao-task-conclusion-body.schema.js";
import { TaskLifecycleService } from "../services/TaskLifecycleService.js";

const router: ReturnType<typeof Router> = Router();
const taskLifecycleService = new TaskLifecycleService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

router.put(
  "/integracao-tasks-conclusion",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const body = parseWithZod(integracaoTaskConclusionBodySchema, req.body);

      const result = await taskLifecycleService.concludeTask({
        user_id,
        organization_id,
        body: {
          ...body,
          observations: body.observations ?? "",
          justification: body.justification ?? "",
        },
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de conclusão de tarefa", { err });
      next(err);
    }
  },
);

router.put(
  "/integracao-tasks-completeRequest",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, req.body);

      const result = await taskLifecycleService.approveTaskCompletion({
        user_id,
        organization_id,
        task_id: parsed.task_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de aprovação de conclusão de tarefa", { err });
      next(err);
    }
  },
);

export { router as taskLifecycleRoutes };
