import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { nodeDeps } from "../nodeDeps.js";
import {
  integracaoTaskPostponementBodySchema,
  integracaoTaskPostponementListQuerySchema,
} from "../schemas/integracaoTaskPostponement.schema.js";
import { TaskPostponementService } from "../services/taskPostponementService.js";

const router: ReturnType<typeof Router> = Router();
const taskPostponementService = new TaskPostponementService(nodeDeps.prisma, nodeDeps.audit);

router.post(
  "/postponement",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const body = parseWithZod(integracaoTaskPostponementBodySchema, req.body);
      const result = await taskPostponementService.create({
        user_id,
        organization_id,
        task_id: body.task_id,
        new_prevision_date: body.new_prevision_date,
        justification: body.justification,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de prorrogação de tarefa", { err });
      next(err);
    }
  },
);

router.get(
  "/postponement/list",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const query = parseWithZod(integracaoTaskPostponementListQuerySchema, req.query);
      const result = await taskPostponementService.list({
        user_id,
        organization_id,
        task_id: query.task_id,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de histórico de prorrogações de tarefa", { err });
      next(err);
    }
  },
);

export { router as taskPostponementRoutes };
