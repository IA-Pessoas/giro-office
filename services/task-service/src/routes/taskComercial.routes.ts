import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { comercialTaskUpdateBodySchema } from "../schemas/comercialTaskUpdateBody.schema.js";
import { TaskComercialService } from "../services/TaskComercialService.js";

const router: ReturnType<typeof Router> = Router();
const taskComercialService = new TaskComercialService();

router.put("/comercial", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const body = parseWithZod(comercialTaskUpdateBodySchema, req.body);

    const result = await taskComercialService.updateChargeComercial({
      user_id,
      organization_id,
      body,
    });

    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar cobranÃ§a comercial", { err });
    next(err);
  }
});

export { router as taskComercialRoutes };
