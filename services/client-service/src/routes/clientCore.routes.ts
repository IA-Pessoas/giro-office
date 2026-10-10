import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireIntegracaoRouteAccess,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  type CreateClientBody,
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  listInstagramProfilesQuerySchema,
  updateClientBodySchema,
} from "../schemas/client.schemas.js";
import {
  hasClientListModuleAccess,
  MARKETING_CLIENT_PROFILE_ACCESS,
} from "../utils/moduleAuthorization.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

function getIntegrationAuthorization(request: Request) {
  return {
    userId: request.user_id,
    level: normalizeModulePermission(request.modules?.integracao),
    isOwner: request.user_type === "owner",
  } as const;
}

function getClientListAuthorization(request: Request) {
  const authorization = getIntegrationAuthorization(request);
  if (authorization.level >= 1) return authorization;

  if (
    authorization.isOwner ||
    (request.permission ?? 0) >= 1 ||
    hasClientListModuleAccess(request.modules)
  ) {
    return { ...authorization, hasClientListAccess: true } as const;
  }

  return authorization;
}

function requireInstagramProfileReadAccess(request: Request, organizationId: string): void {
  if (
    normalizeModulePermission(request.modules?.marketing) >= MARKETING_CLIENT_PROFILE_ACCESS.VIEWER
  ) {
    return;
  }

  requireIntegracaoRouteAccess("GET", "/client/list", {
    ...getIntegrationAuthorization(request),
    organizationId,
    resourceOrganizationId: organizationId,
  });
}

export function createClientCoreRouter(deps: ClientRouterDeps): Router {
  const { clientService } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/instagram-profiles/report",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listInstagramProfilesQuerySchema, request.query);
        const organizationId = resolveOrganizationId(request, undefined);
        requireInstagramProfileReadAccess(request, organizationId);
        const report = await clientService.listInstagramProfiles(organizationId, {
          page: query.page,
          pageSize: query.limit,
          profile: query.profile,
          search: query.search,
        });
        response.json(createSuccessResponse(report));
      } catch (err) {
        logError("Erro ao consultar relatório de perfis Instagram", { err });
        next(err);
      }
    },
  );

  router.get(
    "/list",
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
        const page = await clientService.listByOrganization(
          organizationId,
          listFilters,
          getClientListAuthorization(request),
        );
        response.json(createSuccessResponse(page));
      } catch (err) {
        logError("Erro ao listar clientes", { err });
        next(err);
      }
    },
  );

  router.post(
    "/:id/activate",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.activate(
          params.id,
          organizationId,
          getIntegrationAuthorization(request),
        );
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao ativar cliente", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.deactivate(
          params.id,
          organizationId,
          getIntegrationAuthorization(request),
        );
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao desativar cliente", { err });
        next(err);
      }
    },
  );

  router.get(
    "/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.getById(
          params.id,
          organizationId,
          getIntegrationAuthorization(request),
        );
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao obter cliente", { err });
        next(err);
      }
    },
  );

  router.post(
    "/",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createClientBodySchema, request.body) as CreateClientBody;
        const organizationId = resolveOrganizationId(request, undefined);
        if (body.organization_id && body.organization_id !== organizationId) {
          throw new ServiceError(403, "Não é permitido criar cliente em outra organização.");
        }
        const client = await clientService.create(
          { ...body, organization_id: organizationId },
          getIntegrationAuthorization(request),
        );
        response.status(201).json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao criar cliente", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateClientBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.update(
          params.id,
          organizationId,
          body,
          getIntegrationAuthorization(request),
        );
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao atualizar cliente", { err });
        next(err);
      }
    },
  );

  return router;
}
