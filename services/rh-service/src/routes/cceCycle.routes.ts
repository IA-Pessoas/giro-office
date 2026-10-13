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
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  cceWeeklyEvaluationIdParamSchema,
  configureCceFloorsBodySchema,
  createCceCycleBodySchema,
  updateCceWeeklyEvaluationBodySchema,
} from "../schemas/cceCycle.schemas.js";
import { CceCycleService } from "../services/cceCycleService.js";

const router: ReturnType<typeof Router> = Router();
const cceCycleService = new CceCycleService();

router.get(
  "/floors",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const result = await cceCycleService.getFloorConfiguration(req.organization_id);
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao consultar andares do CCE", { err });
      next(err);
    }
  },
);

router.put(
  "/floors",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      const body = parseWithZod(configureCceFloorsBodySchema, req.body);
      const result = await cceCycleService.configureFloors({
        organization_id: req.organization_id,
        floor_count: body.floor_count,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao configurar andares do CCE", { err });
      next(err);
    }
  },
);

router.post(
  "/cycles",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!req.user_id) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }
      const body = parseWithZod(createCceCycleBodySchema, req.body);
      const result = await cceCycleService.createCycle({
        organization_id: req.organization_id,
        created_by_user_id: req.user_id,
        year: body.year,
        month: body.month,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar ciclo do CCE", { err });
      next(err);
    }
  },
);

router.get(
  "/cycles",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }

      const result = await cceCycleService.listCycles({
        organization_id: req.organization_id,
      });
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar ciclos do CCE", { err });
      next(err);
    }
  },
);

router.patch(
  "/weeks/:id",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      const { id } = parseWithZod(cceWeeklyEvaluationIdParamSchema, req.params);
      const body = parseWithZod(updateCceWeeklyEvaluationBodySchema, req.body);
      const result = await cceCycleService.updateWeeklyEvaluation({
        organization_id: req.organization_id,
        evaluation_id: id,
        monitor_user_id: body.monitor_user_id,
        evaluated_at: body.evaluated_at.toISOString().slice(0, 10),
        occurrences: body.occurrences,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao registrar avaliação do CCE", { err });
      next(err);
    }
  },
);

export default router;
