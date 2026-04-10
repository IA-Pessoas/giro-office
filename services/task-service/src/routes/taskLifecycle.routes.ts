import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { integracaoTaskCompleteRequestBodySchema } from "../schemas/integracaoTaskCompleteRequestBody.schema.js";
import { integracaoTaskConclusionBodySchema } from "../schemas/integracaoTaskConclusionBody.schema.js";
import { TaskLifecycleService } from "../services/TaskLifecycleService.js";

const router: ReturnType<typeof Router> = Router();
const taskLifecycleService = new TaskLifecycleService();

router.put("/conclusion", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
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
    logError("Erro na rota de conclusÃ£o de tarefa", { err });
    next(err);
  }
});

router.put("/complete-request", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, req.body);

    const result = await taskLifecycleService.approveTaskCompletion({
      user_id,
      organization_id,
      task_id: parsed.task_id,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro na rota de aprovaÃ§Ã£o de conclusÃ£o de tarefa", { err });
    next(err);
  }
});

export { router as taskLifecycleRoutes };
