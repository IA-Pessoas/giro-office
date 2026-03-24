import {
  createSuccessResponse,
  error as logError,
  parseIsoDate,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
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

      const body = req.body as Record<string, unknown>;
      const point_id = body.point_id !== undefined ? String(body.point_id) : "";
      const launchIn = body.lunch_in ?? body.launch_in;
      const justification = body.justification !== undefined ? String(body.justification) : "";
      const attachment =
        body.attachment !== undefined && body.attachment !== null
          ? String(body.attachment)
          : undefined;

      const result = await timeClockRequestService.create({
        user_id: userId,
        organization_id: organizationId,
        point_id,
        clock_in: parseIsoDate(body.clock_in, "clock_in"),
        lunch_out: parseIsoDate(body.lunch_out, "lunch_out"),
        lunch_in: parseIsoDate(launchIn, "lunch_in"),
        clock_out: parseIsoDate(body.clock_out, "clock_out"),
        justification,
        attachment,
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

      const body = req.body as Record<string, unknown>;
      const request_id = body.request_id !== undefined ? String(body.request_id) : "";

      const obs_approver =
        body.obs_approver === undefined
          ? undefined
          : body.obs_approver === null
            ? null
            : String(body.obs_approver);

      const result = await timeClockRequestService.approve({
        request_id,
        approver_user_id: userId,
        organization_id: organizationId,
        obs_approver,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao aprovar ajuste de ponto", { err });
      next(err);
    }
  },
);

export default router;
