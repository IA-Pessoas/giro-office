import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { updateScoreNitroBodySchema } from "../schemas/scoreNitro.schemas.js";
import { ScoreNitroService } from "../services/scoreNitroService.js";

const router: ReturnType<typeof Router> = Router();
const scoreNitroService = new ScoreNitroService();

router.put("/update", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(updateScoreNitroBodySchema, req.body);

    const result = await scoreNitroService.updateMetric(organizationId, userId, body);

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao atualizar métrica Nitro", { err });
    next(err);
  }
});

export default router;
