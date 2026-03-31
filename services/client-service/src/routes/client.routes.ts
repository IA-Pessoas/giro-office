import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
} from "../schemas/client.schema.js";
import type { IClientService } from "../services/clientService.js";

function resolveOrganizationId(request: Request, queryOrganizationId: string | undefined): string {
  const fromQuery = queryOrganizationId;
  const fromToken = request.organization_id?.trim() ? request.organization_id : undefined;
  const resolved = fromQuery ?? fromToken;
  if (!resolved) {
    throw new ServiceError(400, "organization_id é obrigatório (query ou token).");
  }
  if (fromToken && fromQuery && fromToken !== fromQuery) {
    throw new ServiceError(403, "organization_id da query não corresponde ao token.");
  }
  return resolved;
}

export function createClientRouter(clientService: IClientService): Router {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listClientsQuerySchema, request.query);
        const organizationId = resolveOrganizationId(request, query.organization_id);
        const listFilters = query.status !== undefined ? { status: query.status } : undefined;
        const items = await clientService.listByOrganization(organizationId, listFilters);
        response.json(createSuccessResponse({ items }));
      } catch (err) {
        logError("Erro ao listar clientes", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.getById(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao obter cliente", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createClientBodySchema, request.body);
        const tokenOrg = request.organization_id?.trim() ? request.organization_id : undefined;
        if (tokenOrg && tokenOrg !== body.organization_id) {
          throw new ServiceError(403, "Não é permitido criar cliente em outra organização.");
        }
        const client = await clientService.create(body);
        response.status(201).json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao criar cliente", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateClientBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.update(params.id, organizationId, body);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao atualizar cliente", { err });
        next(err);
      }
    },
  );

  return router;
}
