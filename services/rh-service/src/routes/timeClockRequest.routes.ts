import {
  createSuccessResponse,
  getSingleTrimmedQueryValue,
  error as logError,
  parseIsoDate,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  canManageRh,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  approveAdjustmentBodySchema,
  createAdjustmentRequestBodySchema,
  listAdjustmentRequestsQuerySchema,
  rejectAdjustmentBodySchema,
} from "../schemas/timeClockRequest.schemas.js";
import { TimeClockRequestService } from "../services/timeClockRequestService.js";

const router: ReturnType<typeof Router> = Router();
const timeClockRequestService = new TimeClockRequestService();

router.get(
  "/adjustment/requests",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });
      const queryInput = {
        status: getSingleTrimmedQueryValue(req.query.status),
        user_id: getSingleTrimmedQueryValue(req.query.user_id),
      };
      const query = parseWithZod(listAdjustmentRequestsQuerySchema, queryInput);

      const result = await timeClockRequestService.list(organization_id, {
        status: query.status,
        user_id: canManageRh(req) ? query.user_id : user_id,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar solicitacoes de ajuste de ponto", { err });
      next(err);
    }
  },
);

router.post(
  "/adjustment/request",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });

      const parsed = parseWithZod(createAdjustmentRequestBodySchema, req.body);
      const lunch_in = parseIsoDate(parsed.lunch_in, "lunch_in");

      const result = await timeClockRequestService.create({
        user_id,
        organization_id,
        point_id: parsed.point_id,
        clock_in: parsed.clock_in,
        lunch_out: parsed.lunch_out,
        lunch_in,
        clock_out: parsed.clock_out,
        justification: parsed.justification,
        attachment:
          parsed.attachment === undefined || parsed.attachment === null
            ? undefined
            : String(parsed.attachment),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao solicitar ajuste de ponto", { err });
      next(err);
    }
  },
);

router.put(
  "/adjustment/approve",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });

      const body = parseWithZod(approveAdjustmentBodySchema, req.body);

      const result = await timeClockRequestService.approve({
        request_id: body.request_id,
        approver_user_id: user_id,
        organization_id,
        obs_approver:
          body.obs_approver === undefined
            ? undefined
            : body.obs_approver === null
              ? null
              : String(body.obs_approver),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao aprovar ajuste de ponto", { err });
      next(err);
    }
  },
);

router.put(
  "/adjustment/reject",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });

      const body = parseWithZod(rejectAdjustmentBodySchema, req.body);

      const result = await timeClockRequestService.reject({
        request_id: body.request_id,
        approver_user_id: user_id,
        organization_id,
        obs_approver:
          body.obs_approver === undefined
            ? undefined
            : body.obs_approver === null
              ? null
              : String(body.obs_approver),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao rejeitar ajuste de ponto", { err });
      next(err);
    }
  },
);

export default router;
