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
  canManageRh,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  generateQuarterBodySchema,
  scoreQuarterIdParamSchema,
  updateNitroBodySchema,
} from "../schemas/scoreQuarter.schemas.js";
import { ScoreQuarterService } from "../services/scoreQuarterService.js";

const router: ReturnType<typeof Router> = Router();
const scoreQuarterService = new ScoreQuarterService();

router.post(
  "/generate",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
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

      const body = parseWithZod(generateQuarterBodySchema, req.body);

      const result = await scoreQuarterService.generateQuarterlyScore({
        organization_id: organizationId,
        target_user_id: body.target_user_id,
        quarter: body.quarter,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao gerar score trimestral", { err });
      next(err);
    }
  },
);

router.patch(
  "/nitro",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
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

      const body = parseWithZod(updateNitroBodySchema, req.body);

      const result = await scoreQuarterService.updateNitro({
        organization_id: organizationId,
        score_id: body.score_id,
        type: body.type,
        value: body.value,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar Nitro do score", { err });
      next(err);
    }
  },
);

router.get(
  "/me",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
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

      const result = await scoreQuarterService.listForUser(organizationId, userId);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar scores do usuário", { err });
      next(err);
    }
  },
);

router.get(
  "/:id",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
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

      const { id } = parseWithZod(scoreQuarterIdParamSchema, req.params);

      const result = await scoreQuarterService.getDetail({
        organization_id: organizationId,
        score_id: id,
        user_id: userId,
        can_manage: canManageRh(req),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao obter detalhe do score trimestral", { err });
      next(err);
    }
  },
);

export default router;
