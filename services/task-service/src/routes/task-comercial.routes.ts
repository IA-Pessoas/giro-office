import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { comercialTaskUpdateBodySchema } from "../schemas/comercial-task-update-body.schema.js";
import { TaskComercialService } from "../services/TaskComercialService.js";

const router: ReturnType<typeof Router> = Router();
const taskComercialService = new TaskComercialService();

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id };
}

router.put(
  "/comercial",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const body = parseWithZod(comercialTaskUpdateBodySchema, req.body);

      const result = await taskComercialService.updateChargeComercial({
        user_id,
        organization_id,
        body,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar cobrança comercial", { err });
      next(err);
    }
  },
);

export { router as taskComercialRoutes };
