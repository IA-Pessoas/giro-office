import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import {
  createTriageCompetenceBodySchema,
  listTriageCompetenceQuerySchema,
  triageCompetenceIdParamsSchema,
} from "../schemas/triageCompetence.schemas.js";
import type { TriageCompetenceService } from "../services/triageCompetenceService.js";

export type TriageCompetenceRouteDeps = Pick<
  TriageCompetenceService,
  "create" | "list" | "archive"
>;

function getContext(request: Request): TriagemRequestContext {
  return request.triagemContext ?? { requestId: "missing" };
}

export function createTriageCompetenceRoutes(
  service: TriageCompetenceRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/competencies",
    isAuthenticated,
    async (request: Request, response: Response, next) => {
      try {
        const query = parseWithZod(listTriageCompetenceQuerySchema, request.query);
        const context = getContext(request);
        const result = await service.list(
          {
            clientId: query.client_id,
            competence: query.competence,
            includeArchived: query.include_archived,
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
        logError("Erro ao listar competências da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/competencies",
    isAuthenticated,
    async (request: Request, response: Response, next) => {
      try {
        const body = parseWithZod(createTriageCompetenceBodySchema, request.body);
        const context = getContext(request);
        const result = await service.create(body, {
          userId: context.userId ?? "",
          organizationId: context.organizationId ?? "",
          permission: context.permission,
          modules: context.modules,
        });
        response.status(201).json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao criar competência da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.patch(
    "/competencies/:id/archive",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageCompetenceIdParamsSchema, request.params);
        const context = getContext(request);
        const result = await service.archive(params.id, {
          userId: context.userId ?? "",
          organizationId: context.organizationId ?? "",
          permission: context.permission,
          modules: context.modules,
        });
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao arquivar competência da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}
