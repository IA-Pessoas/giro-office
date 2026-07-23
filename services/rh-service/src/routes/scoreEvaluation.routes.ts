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
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { submitScoreEvaluationBodySchema } from "../schemas/scoreEvaluation.schemas.js";
import { ScoreEvaluationService } from "../services/scoreEvaluationService.js";

const router: ReturnType<typeof Router> = Router();
const scoreEvaluationService = new ScoreEvaluationService();

router.get(
  "/pending",
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

      const result = await scoreEvaluationService.listPendingEvaluations(organizationId, userId);
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar avaliações pendentes de score", { err });
      next(err);
    }
  },
);

router.post(
  "/submit",
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

      const body = parseWithZod(submitScoreEvaluationBodySchema, req.body);

      const result = await scoreEvaluationService.submitEvaluation({
        organization_id: organizationId,
        user_id: userId,
        evaluation_id: body.evaluation_id,
        answers: body.answers,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao submeter avaliação de score", { err });
      next(err);
    }
  },
);

export default router;
