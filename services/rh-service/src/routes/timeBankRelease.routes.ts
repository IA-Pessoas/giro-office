import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  approveTimeBankReleaseBodySchema,
  createTimeBankReleaseBodySchema,
} from "../schemas/timeBankRelease.schemas.js";
import { TimeBankReleaseService } from "../services/timeBankReleaseService.js";

const router: ReturnType<typeof Router> = Router();
const timeBankReleaseService = new TimeBankReleaseService();

router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization_id;
    const userId = req.user_id;
    if (!organizationId) {
      throw new ServiceError(400, "organization_id é obrigatório.");
    }
    if (!userId) {
      throw new ServiceError(400, "user_id é obrigatório.");
    }

    const body = parseWithZod(createTimeBankReleaseBodySchema, req.body);

    const result = await timeBankReleaseService.create({
      organization_id: organizationId,
      target_user_id: body.user_id,
      date: body.date,
      minutes: body.minutes,
      reason: body.reason,
      added_by_user_id: userId,
    });

    res.status(200).json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro ao criar lançamento de banco de horas", { err });
    next(err);
  }
});

router.post(
  "/approve",
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

      const body = parseWithZod(approveTimeBankReleaseBodySchema, req.body);

      const result = await timeBankReleaseService.approve({
        id: body.id,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao aprovar lançamento de banco de horas", { err });
      next(err);
    }
  },
);

export default router;
