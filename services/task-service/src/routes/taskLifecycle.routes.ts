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
import { integracaoTaskCompleteRequestBodySchema } from "../schemas/integracaoTaskCompleteRequestBody.schema.js";
import {
  integracaoTaskCompletionRequestBodySchema,
  integracaoTaskCompletionRequestListQuerySchema,
  integracaoTaskReopenBodySchema,
} from "../schemas/integracaoTaskCompletionRequest.schema.js";
import { integracaoTaskConclusionBodySchema } from "../schemas/integracaoTaskConclusionBody.schema.js";
import { TaskLifecycleService } from "../services/taskLifecycleService.js";

const router: ReturnType<typeof Router> = Router();
const taskLifecycleService = new TaskLifecycleService(
  nodeDeps.prisma,
  nodeDeps.audit,
  nodeDeps.projectProgress,
);

router.put(
  "/conclusion",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const body = parseWithZod(integracaoTaskConclusionBodySchema, req.body);

      const result = await taskLifecycleService.concludeTask({
        user_id,
        organization_id,
        body: {
          ...body,
          observations: body.observations ?? "",
          justification: body.justification ?? "",
        },
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de conclusÃ£o de tarefa", { err });
      next(err);
    }
  },
);

router.post(
  "/complete-request",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const body = parseWithZod(integracaoTaskCompletionRequestBodySchema, req.body);
      const result = await taskLifecycleService.requestTaskCompletion({
        user_id,
        organization_id,
        task_id: body.task_id,
        reason: body.reason,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de solicitação de conclusão de tarefa", { err });
      next(err);
    }
  },
);

router.put(
  "/complete-request",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, req.body);

      const result = await taskLifecycleService.approveTaskCompletion({
        user_id,
        organization_id,
        task_id: parsed.task_id,
        ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
        ...(parsed.decision ? { decision: parsed.decision } : {}),
        ...(parsed.reason ? { reason: parsed.reason } : {}),
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de aprovação de conclusão de tarefa", { err });
      next(err);
    }
  },
);

router.delete(
  "/complete-request",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const parsed = parseWithZod(integracaoTaskCompleteRequestBodySchema, req.body);
      const result = await taskLifecycleService.cancelTaskCompletion({
        user_id,
        organization_id,
        task_id: parsed.task_id,
        ...(parsed.request_id ? { request_id: parsed.request_id } : {}),
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de cancelamento de conclusão de tarefa", { err });
      next(err);
    }
  },
);

router.get(
  "/complete-request/list",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const query = parseWithZod(integracaoTaskCompletionRequestListQuerySchema, req.query);
      const result = await taskLifecycleService.listTaskCompletionRequests({
        user_id,
        organization_id,
        task_id: query.task_id,
        integracaoLevel: normalizeModulePermission(req.modules?.integracao),
        isOwner: req.user_type === "owner",
      });
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro na rota de histórico de conclusão de tarefa", { err });
      next(err);
    }
  },
);

router.put("/reopen", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
    const body = parseWithZod(integracaoTaskReopenBodySchema, req.body);
    const result = await taskLifecycleService.reopenTask({
      user_id,
      organization_id,
      task_id: body.task_id,
      reason: body.reason,
      integracaoLevel: normalizeModulePermission(req.modules?.integracao),
      isOwner: req.user_type === "owner",
    });
    res.json(createSuccessResponse(result));
  } catch (err) {
    logError("Erro na rota de reabertura de tarefa", { err });
    next(err);
  }
});

export { router as taskLifecycleRoutes };
