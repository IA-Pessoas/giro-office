import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { clientIdParamsSchema } from "../schemas/client.schema.js";
import {
  createClientPABodySchema,
  updateClientPABodySchema,
} from "../schemas/clientVerticals.schema.js";
import { createClientPA, getClientPADetail, updateClientPA } from "../services/clientPAService.js";
import { type ClientRouterDeps, resolveOrganizationId } from "./clientRouteHelpers.js";

export function createClientPARouter(deps: ClientRouterDeps): Router {
  const { prisma } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/clients/:id/pa",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        parseWithZod(createClientPABodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const created = await createClientPA(prisma, organizationId, { client_id: params.id });
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar PA do cliente", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/:id/pa",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const detail = await getClientPADetail(prisma, params.id, organizationId);
        response.json(createSuccessResponse({ detail }));
      } catch (err) {
        logError("Erro ao obter PA do cliente", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/pa",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateClientPABodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateClientPA(prisma, params.id, organizationId, body);
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar PA do cliente", { err });
        next(err);
      }
    },
  );

  return router;
}
