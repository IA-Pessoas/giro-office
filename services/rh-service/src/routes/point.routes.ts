import {
  createSuccessResponse,
  getSingleTrimmedQueryValue,
  error as logError,
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
  listPointsQuerySchema,
  pointIdParamsSchema,
  pointSummaryQuerySchema,
} from "../schemas/point.schemas.js";
import { PointService } from "../services/pointService.js";

const router: ReturnType<typeof Router> = Router();
const pointService = new PointService();

router.get(
  "/",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });
      const queryInput = {
        date_from: getSingleTrimmedQueryValue(req.query.date_from),
        date_to: getSingleTrimmedQueryValue(req.query.date_to),
        user_id: getSingleTrimmedQueryValue(req.query.user_id),
      };
      const query = parseWithZod(listPointsQuerySchema, queryInput);

      const result = await pointService.listPoints(organization_id, {
        user_id: canManageRh(req) ? query.user_id : user_id,
        date_from: query.date_from,
        date_to: query.date_to,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar registros de ponto", { err });
      next(err);
    }
  },
);

router.get(
  "/me/today",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });

      const result = await pointService.getTodayPointForUser({
        organization_id,
        user_id,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar ponto do dia", { err });
      next(err);
    }
  },
);

router.get(
  "/summary",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });
      const queryInput = {
        month: getSingleTrimmedQueryValue(req.query.month),
        user_id: getSingleTrimmedQueryValue(req.query.user_id),
      };
      const query = parseWithZod(pointSummaryQuerySchema, queryInput);

      const result = await pointService.getMonthlySummary({
        organization_id,
        user_id: canManageRh(req) ? (query.user_id ?? user_id) : user_id,
        month: query.month,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao gerar resumo mensal de ponto", { err });
      next(err);
    }
  },
);

router.post(
  "/register",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
        statusCode: 400,
      });

      const result = await pointService.registerPoint({
        user_id,
        organization_id,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao registrar ponto", { err });
      next(err);
    }
  },
);

router.post(
  "/:pointId/calculate",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthenticatedRequestContext(req, { statusCode: 400 });
      const { pointId } = parseWithZod(pointIdParamsSchema, req.params);

      const result = await pointService.calculateDailyHours(pointId, organization_id);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao calcular horas do ponto", { err });
      next(err);
    }
  },
);

export default router;
