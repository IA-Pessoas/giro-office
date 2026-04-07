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
  ADMIN_PERMISSION,
  type CreateClientBody,
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
} from "../schemas/client.schema.js";
import { type ClientRouterDeps, resolveOrganizationId } from "./clientRouteHelpers.js";

export function createClientCoreRouter(deps: ClientRouterDeps): Router {
  const { clientService } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listClientsQuerySchema, request.query);
        const organizationId = resolveOrganizationId(request, query.organization_id);
        const listFilters = {
          ref: query.ref,
          status: query.status,
          page: query.page ?? 1,
          pageSize: query.limit ?? 20,
          search: query.search,
        };
        const page = await clientService.listByOrganization(organizationId, listFilters);
        response.json(createSuccessResponse(page));
      } catch (err) {
        logError("Erro ao listar clientes", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients/:id/activate",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.activate(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao ativar cliente", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        if (request.permission !== ADMIN_PERMISSION) {
          throw new ServiceError(403, "Usuário não tem permissão para desativar cliente.");
        }
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.deactivate(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao desativar cliente", { err });
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
        const body = parseWithZod(createClientBodySchema, request.body) as CreateClientBody;
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
