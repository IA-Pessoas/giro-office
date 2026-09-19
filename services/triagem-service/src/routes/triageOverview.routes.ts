import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import { listTriageOverviewQuerySchema } from "../schemas/triageOverview.schemas.js";
import type { TriageOverviewService } from "../services/triageOverviewService.js";

export type TriageOverviewRouteDeps = Pick<TriageOverviewService, "list">;

function getContext(request: Request): TriagemRequestContext {
  return request.triagemContext ?? { requestId: "missing" };
}

export function createTriageOverviewRoutes(
  service: TriageOverviewRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/overview", isAuthenticated, async (request: Request, response: Response, next) => {
    try {
      const query = parseWithZod(listTriageOverviewQuerySchema, request.query);
      const context = getContext(request);
      const result = await service.list(
        {
          page: query.page,
          pageSize: query.page_size,
          clientId: query.client_id,
          competence: query.competence,
          status: query.status,
        },
        {
          userId: context.userId ?? "",
          organizationId: context.organizationId ?? "",
          permission: context.permission,
          modules: context.modules,
        },
      );
      response.json(createSuccessResponse(result));
    } catch (error: unknown) {
      logError("Erro ao listar o painel consolidado da Triagem", { err: error });
      next(error);
    }
  });

  return router;
}
