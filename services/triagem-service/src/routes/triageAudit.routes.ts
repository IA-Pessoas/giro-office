import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  parseWithZod,
} from "@workspace/shared";
import type { Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import {
  listTriageCompetenceHistoryQuerySchema,
  triageCompetenceHistoryParamsSchema,
} from "../schemas/triageAudit.schemas.js";
import type { TriageAuditService } from "../services/triageAuditService.js";

export type TriageAuditRouteDeps = Pick<TriageAuditService, "listTimeline" | "reconcile">;

function getContext(request: Request): TriagemRequestContext {
  return request.triagemContext ?? { requestId: "missing" };
}

function contextAuth(request: Request): {
  userId: string;
  organizationId: string;
  permission?: number;
  modules?: Record<string, number>;
} {
  const context = getContext(request);
  return {
    userId: context.userId ?? "",
    organizationId: context.organizationId ?? "",
    permission: context.permission,
    modules: context.modules,
  };
}

export function createTriageAuditRoutes(service: TriageAuditRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/competencies/:id/history",
    isAuthenticated,
    async (request: Request, response: Response, next) => {
      try {
        const params = parseWithZod(triageCompetenceHistoryParamsSchema, request.params);
        const query = parseWithZod(listTriageCompetenceHistoryQuerySchema, request.query);
        response.json(
          createSuccessResponse(
            await service.listTimeline(
              { competenceId: params.id, page: query.page, pageSize: query.page_size },
              contextAuth(request),
            ),
          ),
        );
      } catch (error: unknown) {
        logError("Erro ao listar histórico da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}

export function createTriageAuditInternalRoutes(
  service: TriageAuditRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/audit/reconcile",
    isAuthenticated,
    async (request: Request, response: Response, next) => {
      try {
        if (!request.get(INTERNAL_SERVICE_TOKEN_HEADER)) {
          response.status(401);
          throw new Error("Token interno obrigatório.");
        }
        response.json(createSuccessResponse(await service.reconcile(contextAuth(request))));
      } catch (error: unknown) {
        logError("Erro ao reconciliar auditoria da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}
