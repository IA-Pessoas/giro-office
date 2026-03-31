import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { financeiroTaskUpdateBodySchema } from "../schemas/financeiro-task-update-body.schema.js";
import { TaskFinanceiroService } from "../services/TaskFinanceiroService.js";

const router: ReturnType<typeof Router> = Router();
const taskFinanceiroService = new TaskFinanceiroService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

router.put(
  "/financeiro-tasks",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const parsed = parseWithZod(financeiroTaskUpdateBodySchema, req.body);

      const result = await taskFinanceiroService.updateChargeFinanceiro({
        user_id,
        organization_id,
        task_id: parsed.task_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar cobrança financeira", { err });
      next(err);
    }
  },
);

export { router as taskFinanceiroRoutes };
