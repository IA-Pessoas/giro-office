import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { financeiroTaskUpdateBodySchema } from "../schemas/financeiro-task-update-body.schema.js";
import { TaskFinanceiroService } from "../services/TaskFinanceiroService.js";

const router: ReturnType<typeof Router> = Router();
const taskFinanceiroService = new TaskFinanceiroService();

router.put("/financeiro", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const parsed = parseWithZod(financeiroTaskUpdateBodySchema, req.body);

    const result = await taskFinanceiroService.updateChargeFinanceiro({
      user_id,
      organization_id,
      task_id: parsed.task_id,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar cobranÃ§a financeira", { err });
    next(err);
  }
});

export { router as taskFinanceiroRoutes };
