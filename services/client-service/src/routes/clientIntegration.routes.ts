import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { clientIdParamsSchema } from "../schemas/client.schemas.js";
import {
  type CreateIntegrationBody,
  createIntegrationBodySchema,
  updateIntegrationBodySchema,
} from "../schemas/clientVerticals.schemas.js";
import {
  createIntegrationClient,
  updateIntegrationClient,
} from "../services/clientIntegrationService.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

function getIntegrationAuthorization(request: Request) {
  return {
    userId: request.user_id,
    level: normalizeModulePermission(request.modules?.integracao),
    isOwner: request.user_type === "owner",
  } as const;
}

export function createClientIntegrationRouter(deps: ClientRouterDeps): Router {
  const { prisma } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/integration",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(
          createIntegrationBodySchema,
          request.body,
        ) as CreateIntegrationBody;
        const organizationId = resolveOrganizationId(request, undefined);
        if (body.organization_id && body.organization_id !== organizationId) {
          throw new ServiceError(403, "Integração não permitida para outra organização.");
        }
        const created = await createIntegrationClient(
          prisma,
          {
            ...body,
            organization_id: organizationId,
          },
          getIntegrationAuthorization(request),
        );
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar cliente (integração)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/integration",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateIntegrationBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateIntegrationClient(
          prisma,
          params.id,
          organizationId,
          body,
          getIntegrationAuthorization(request),
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (integração)", { err });
        next(err);
      }
    },
  );

  return router;
}
