import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createTriageSolicitationBodySchema,
  listTriageSolicitationQuerySchema,
  triageSolicitationIdParamsSchema,
  updateTriageNoteCountsBodySchema,
} from "../schemas/triageSolicitation.schemas.js";
import type { TriageSolicitationService } from "../services/triageSolicitationService.js";

export type TriageSolicitationRouteDeps = Pick<
  TriageSolicitationService,
  "list" | "get" | "create" | "close" | "getNoteCounts" | "updateNoteCounts"
>;

function authContext(request: Request) {
  const context = request.triagemContext ?? { requestId: "missing" };
  return {
    userId: context.userId ?? "",
    organizationId: context.organizationId ?? "",
    permission: context.permission,
    modules: context.modules,
  };
}

export function createTriageSolicitationRoutes(
  service: TriageSolicitationRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/solicitations",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listTriageSolicitationQuerySchema, request.query);
        const result = await service.list(
          { status: query.status, clientId: query.client_id, competence: query.competence },
          authContext(request),
        );
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao listar solicitações da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/solicitations",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createTriageSolicitationBodySchema, request.body);
        const result = await service.create(body, authContext(request));
        response.status(201).json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao criar solicitação da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.get(
    "/solicitations/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(triageSolicitationIdParamsSchema, request.params);
        response.json(createSuccessResponse(await service.get(id, authContext(request))));
      } catch (error: unknown) {
        logError("Erro ao consultar solicitação da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.patch(
    "/solicitations/:id/close",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(triageSolicitationIdParamsSchema, request.params);
        response.json(createSuccessResponse(await service.close(id, authContext(request))));
      } catch (error: unknown) {
        logError("Erro ao fechar solicitação da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.get(
    "/solicitations/:id/note-counts",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(triageSolicitationIdParamsSchema, request.params);
        response.json(createSuccessResponse(await service.getNoteCounts(id, authContext(request))));
      } catch (error: unknown) {
        logError("Erro ao consultar contadores de notas da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.put(
    "/solicitations/:id/note-counts",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(triageSolicitationIdParamsSchema, request.params);
        const body = parseWithZod(updateTriageNoteCountsBodySchema, request.body);
        const result = await service.updateNoteCounts(id, body, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao atualizar contadores de notas da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}
