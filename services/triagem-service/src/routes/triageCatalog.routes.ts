import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { Request } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import {
  createTriageCatalogBodySchema,
  listTriageCatalogQuerySchema,
  triageCatalogIdParamsSchema,
  updateTriageCatalogBodySchema,
} from "../schemas/triageCatalog.schemas.js";
import type { TriageCatalogService } from "../services/triageCatalogService.js";

export type TriageCatalogRouteDeps = Pick<
  TriageCatalogService,
  "list" | "create" | "update" | "archive"
>;

function getContext(request: Request): TriagemRequestContext {
  return request.triagemContext ?? { requestId: "missing" };
}

function authContext(request: Request) {
  const context = getContext(request);
  return {
    userId: context.userId ?? "",
    organizationId: context.organizationId ?? "",
    permission: context.permission,
    modules: context.modules,
  };
}

export function createTriageCatalogRoutes(
  service: TriageCatalogRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/catalogs", isAuthenticated, async (request, response, next) => {
    try {
      const query = parseWithZod(listTriageCatalogQuerySchema, request.query);
      const result = await service.list(
        {
          kind: query.kind,
          includeArchived: query.include_archived,
          clientId: query.client_id,
          competence: query.competence,
        },
        authContext(request),
      );
      response.json(createSuccessResponse(result));
    } catch (error: unknown) {
      logError("Erro ao listar catálogos da Triagem", { err: error });
      next(error);
    }
  });

  router.post("/catalogs", isAuthenticated, async (request, response, next) => {
    try {
      const body = parseWithZod(createTriageCatalogBodySchema, request.body);
      const result = await service.create(body, authContext(request));
      response.status(201).json(createSuccessResponse(result));
    } catch (error: unknown) {
      logError("Erro ao criar item de catálogo da Triagem", { err: error });
      next(error);
    }
  });

  router.patch("/catalogs/:id", isAuthenticated, async (request, response, next) => {
    try {
      const params = parseWithZod(triageCatalogIdParamsSchema, request.params);
      const body = parseWithZod(updateTriageCatalogBodySchema, request.body);
      const result = await service.update(params.id, body, authContext(request));
      response.json(createSuccessResponse(result));
    } catch (error: unknown) {
      logError("Erro ao atualizar item de catálogo da Triagem", { err: error });
      next(error);
    }
  });

  router.patch("/catalogs/:id/archive", isAuthenticated, async (request, response, next) => {
    try {
      const params = parseWithZod(triageCatalogIdParamsSchema, request.params);
      const result = await service.archive(params.id, authContext(request));
      response.json(createSuccessResponse(result));
    } catch (error: unknown) {
      logError("Erro ao arquivar item de catálogo da Triagem", { err: error });
      next(error);
    }
  });

  return router;
}
