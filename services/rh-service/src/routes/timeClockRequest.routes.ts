import {
  createSuccessResponse,
  error as logError,
  parseIsoDate,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { parseWithZod } from "@workspace/shared";
import {
  approveAdjustmentBodySchema,
  createAdjustmentRequestBodySchema,
} from "../schemas/timeClockRequest.schemas.js";
import { TimeClockRequestService } from "../services/timeClockRequestService.js";

const router: ReturnType<typeof Router> = Router();
const timeClockRequestService = new TimeClockRequestService();

router.post(
  "/point/adjustment/request",
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

      const parsed = parseWithZod(createAdjustmentRequestBodySchema, req.body);
      const lunch_in = parseIsoDate(parsed.lunch_in, "lunch_in");

      const result = await timeClockRequestService.create({
        user_id: userId,
        organization_id: organizationId,
        point_id: parsed.point_id,
        clock_in: parsed.clock_in,
        lunch_out: parsed.lunch_out,
        lunch_in,
        clock_out: parsed.clock_out,
        justification: parsed.justification,
        attachment: parsed.attachment,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao solicitar ajuste de ponto", { err });
      next(err);
    }
  },
);

router.put(
  "/point/adjustment/approve",
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

      const body = parseWithZod(approveAdjustmentBodySchema, req.body);

      const result = await timeClockRequestService.approve({
        request_id: body.request_id,
        approver_user_id: userId,
        organization_id: organizationId,
        obs_approver: body.obs_approver,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao aprovar ajuste de ponto", { err });
      next(err);
    }
  },
);

export default router;
