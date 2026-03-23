import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { PointService } from "../services/pointService.js";

const router: ReturnType<typeof Router> = Router();
const pointService = new PointService();

router.post(
  "/point/register",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const result = await pointService.registerPoint({
        user_id: userId,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao registrar ponto", { err });
      next(err);
    }
  },
);

router.post(
  "/point/:pointId/calculate",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const { pointId } = req.params;
      const result = await pointService.calculateDailyHours(pointId, organizationId);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao calcular horas do ponto", { err });
      next(err);
    }
  },
);

export default router;
