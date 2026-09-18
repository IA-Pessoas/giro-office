import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import {
  createTriageExternalLinkBodySchema,
  listTriageExternalLinkQuerySchema,
  triageExternalLinkIdParamsSchema,
  updateTriageExternalLinkBodySchema,
} from "../schemas/triageExternalLinks.schemas.js";
import type { TriageExternalLinkService } from "../services/triageExternalLinkService.js";

export type TriageExternalLinkRouteDeps = Pick<
  TriageExternalLinkService,
  "list" | "create" | "update" | "archive"
>;

function getContext(request: Request): TriagemRequestContext {
  return request.triagemContext ?? { requestId: "missing" };
}

function authContext(request: Request): {
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

export function createTriageExternalLinkRoutes(
  service: TriageExternalLinkRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/external-links",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listTriageExternalLinkQuerySchema, request.query);
        const result = await service.list(
          {
            clientId: query.client_id,
            competence: query.competence,
            includeArchived: query.include_archived,
          },
          authContext(request),
        );
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao listar links externos da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/external-links",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createTriageExternalLinkBodySchema, request.body);
        const result = await service.create(body, authContext(request));
        response.status(201).json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao criar link externo da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.put(
    "/external-links/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageExternalLinkIdParamsSchema, request.params);
        const body = parseWithZod(updateTriageExternalLinkBodySchema, request.body);
        const result = await service.update(params.id, body, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao atualizar link externo da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.patch(
    "/external-links/:id/archive",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageExternalLinkIdParamsSchema, request.params);
        const result = await service.archive(params.id, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao arquivar link externo da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}
