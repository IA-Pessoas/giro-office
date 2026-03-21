import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { PointConfigService } from "../services/PointConfigService.js";

const router: ReturnType<typeof Router> = Router();
const pointConfigService = new PointConfigService();

router.put(
  "/point-config",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const targetUserId = (req.body.target_user_id as string | undefined) ?? req.user_id;
      const { start_time, lunch_break, lunch_return, end_time, work_days } = req.body as Record<
        string,
        unknown
      >;

      const result = await pointConfigService.upsert({
        user_id: targetUserId,
        organization_id: organizationId,
        start_time: String(start_time ?? ""),
        lunch_break: String(lunch_break ?? ""),
        lunch_return: String(lunch_return ?? ""),
        end_time: String(end_time ?? ""),
        work_days: work_days !== undefined ? String(work_days) : undefined,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao upsert point config", { err });
      next(err);
    }
  },
);

router.get(
  "/point-config",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const result = await pointConfigService.getByUserId(req.user_id, organizationId);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar point config", { err });
      next(err);
    }
  },
);

router.get(
  "/point-config/:userId",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const result = await pointConfigService.getByUserId(req.params.userId, organizationId);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar point config por usuário", { err });
      next(err);
    }
  },
);

export default router;
