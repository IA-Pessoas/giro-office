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
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  createScoreQuestionBodySchema,
  deleteScoreQuestionBodySchema,
  listScoreQuestionQuerySchema,
  updateScoreQuestionBodySchema,
} from "../schemas/scoreQuestion.schemas.js";
import {
  type ScoreQuestionListOptions,
  ScoreQuestionService,
  type ScoreQuestionSnapshot,
  type ScoreQuestionUpdateInput,
} from "../services/scoreQuestionService.js";

const router: ReturnType<typeof Router> = Router();
const scoreQuestionService = new ScoreQuestionService();

router.post(
  "/",
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

      const body = parseWithZod(createScoreQuestionBodySchema, req.body);

      const result = await scoreQuestionService.create({
        organization_id: organizationId,
        question: body.question,
        type: body.type,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar pergunta de score", { err });
      next(err);
    }
  },
);

router.put(
  "/",
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

      const body = parseWithZod(updateScoreQuestionBodySchema, req.body);

      const updateInput: ScoreQuestionUpdateInput = {
        id: body.id,
        organization_id: organizationId,
      };
      if (body.question !== undefined) {
        updateInput.question = body.question;
      }
      if (body.type !== undefined) {
        updateInput.type = body.type;
      }
      if (body.active !== undefined) {
        updateInput.active = body.active;
      }

      const result = await scoreQuestionService.update(updateInput);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar pergunta de score", { err });
      next(err);
    }
  },
);

router.get(
  "/",
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

      const query = parseWithZod(listScoreQuestionQuerySchema, req.query);

      const listOptions: ScoreQuestionListOptions = {
        includeInactive: query.all === "true",
      };
      if (query.type !== undefined) {
        listOptions.type = query.type as ScoreQuestionSnapshot["type"];
      }

      const result = await scoreQuestionService.list(organizationId, listOptions);

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar perguntas de score", { err });
      next(err);
    }
  },
);

router.delete(
  "/",
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

      const body = parseWithZod(deleteScoreQuestionBodySchema, req.body);

      const result = await scoreQuestionService.delete({
        id: body.id,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao inativar pergunta de score", { err });
      next(err);
    }
  },
);

export default router;
