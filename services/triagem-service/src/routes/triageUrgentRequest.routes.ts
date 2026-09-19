import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import type { TriagemRequestContext } from "../middlewares/requestContext.js";
import {
  closeTriageUrgentRequestBodySchema,
  createTriageUrgentRequestBodySchema,
  listTriageUrgentRequestQuerySchema,
  triageUrgentRequestIdParamsSchema,
  updateTriageUrgentRequestBodySchema,
} from "../schemas/triageUrgentRequest.schemas.js";
import type { TriageUrgentRequestService } from "../services/triageUrgentRequestService.js";

export type TriageUrgentRequestRouteDeps = Pick<
  TriageUrgentRequestService,
  "list" | "create" | "update" | "close" | "reopen"
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

export function createTriageUrgentRequestRoutes(
  service: TriageUrgentRequestRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/urgent-requests",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listTriageUrgentRequestQuerySchema, request.query);
        const result = await service.list(
          { clientId: query.client_id, competence: query.competence, status: query.status },
          authContext(request),
        );
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao listar solicitações urgentes da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/urgent-requests",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createTriageUrgentRequestBodySchema, request.body);
        const result = await service.create(body, authContext(request));
        response.status(201).json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao criar solicitação urgente da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.put(
    "/urgent-requests/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageUrgentRequestIdParamsSchema, request.params);
        const body = parseWithZod(updateTriageUrgentRequestBodySchema, request.body);
        const result = await service.update(params.id, body, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao atualizar solicitação urgente da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.patch(
    "/urgent-requests/:id/close",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageUrgentRequestIdParamsSchema, request.params);
        const body = parseWithZod(closeTriageUrgentRequestBodySchema, request.body);
        const result = await service.close(params.id, body.resolution_note, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao fechar solicitação urgente da Triagem", { err: error });
        next(error);
      }
    },
  );

  router.patch(
    "/urgent-requests/:id/reopen",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(triageUrgentRequestIdParamsSchema, request.params);
        const result = await service.reopen(params.id, authContext(request));
        response.json(createSuccessResponse(result));
      } catch (error: unknown) {
        logError("Erro ao reabrir solicitação urgente da Triagem", { err: error });
        next(error);
      }
    },
  );

  return router;
}
