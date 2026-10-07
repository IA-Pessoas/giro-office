import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  clientGroupParamsSchema,
  createClientGroupBodySchema,
  replaceClientGroupClientsBodySchema,
  updateClientGroupBodySchema,
} from "../schemas/clientGroup.schemas.js";
import { ClientGroupService } from "../services/clientGroupService.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

function authorization(request: Request) {
  return {
    userId: request.user_id,
    level: normalizeModulePermission(request.modules?.integracao),
    isOwner: request.user_type === "owner",
  } as const;
}

export function createClientGroupsRouter(deps: ClientRouterDeps) {
  const router = Router();
  const service = new ClientGroupService(deps.prisma);

  router.get(
    "/groups",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const organizationId = resolveOrganizationId(request, undefined);
        const groups = await service.list(organizationId, authorization(request));
        response.json(createSuccessResponse(groups));
      } catch (err) {
        logError("Erro ao listar grupos de clientes", { err });
        next(err);
      }
    },
  );

  router.post(
    "/groups",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createClientGroupBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const group = await service.create(organizationId, body.name, authorization(request));
        response.status(201).json(createSuccessResponse(group));
      } catch (err) {
        logError("Erro ao criar grupo de clientes", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/groups/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientGroupParamsSchema, request.params);
        const body = parseWithZod(updateClientGroupBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const group = await service.update(
          params.id,
          organizationId,
          body.name,
          authorization(request),
        );
        response.json(createSuccessResponse(group));
      } catch (err) {
        logError("Erro ao atualizar grupo de clientes", { err });
        next(err);
      }
    },
  );

  router.put(
    "/groups/:id/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientGroupParamsSchema, request.params);
        const body = parseWithZod(replaceClientGroupClientsBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const group = await service.replaceClients(
          params.id,
          organizationId,
          body.client_ids,
          authorization(request),
        );
        response.json(createSuccessResponse(group));
      } catch (err) {
        logError("Erro ao atualizar clientes do grupo", { err });
        next(err);
      }
    },
  );

  return router;
}
