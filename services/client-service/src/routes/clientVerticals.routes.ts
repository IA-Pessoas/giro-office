import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { clientIdParamsSchema } from "../schemas/client.schemas.js";
import {
  terminationBodySchema,
  updateCommercialBodySchema,
  updateFinanceBodySchema,
  updateRegularizeBodySchema,
} from "../schemas/clientVerticals.schemas.js";
import { updateCommercialClient } from "../services/clientCommercialService.js";
import { updateFinanceClient } from "../services/clientFinanceService.js";
import { updateRegularizeClient } from "../services/clientRegularizeService.js";
import { terminateClient } from "../services/clientTerminationService.js";
import {
  CLIENT_DOMAIN_EDIT_PERMISSION,
  requireClientDomainAccess,
  requireClientDomainModule,
} from "../utils/moduleAuthorization.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

export function createClientVerticalsRouter(deps: ClientRouterDeps): Router {
  const { prisma } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.patch(
    "/:id/commercial",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateCommercialBodySchema, request.body);
        requireClientDomainModule(request, "comercial", CLIENT_DOMAIN_EDIT_PERMISSION);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateCommercialClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (comercial)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/termination",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(terminationBodySchema, request.body);
        requireClientDomainAccess(request, CLIENT_DOMAIN_EDIT_PERMISSION);
        const organizationId = resolveOrganizationId(request, undefined);
        const created = await terminateClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao processar distrato", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/finance",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateFinanceBodySchema, request.body);
        requireClientDomainModule(request, "financeiro", CLIENT_DOMAIN_EDIT_PERMISSION);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateFinanceClient(prisma, params.id, organizationId, body);
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (financeiro)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/regularize",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateRegularizeBodySchema, request.body);
        requireClientDomainModule(request, "regularize", CLIENT_DOMAIN_EDIT_PERMISSION);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateRegularizeClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (regularize)", { err });
        next(err);
      }
    },
  );

  return router;
}
