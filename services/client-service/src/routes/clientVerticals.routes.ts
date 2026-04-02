import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { clientIdParamsSchema } from "../schemas/client.schema.js";
import {
  terminationBodySchema,
  updateCommercialBodySchema,
  updateFinanceBodySchema,
  updateRegularizeBodySchema,
} from "../schemas/clientVerticals.schema.js";
import { updateCommercialClient } from "../services/clientCommercialService.js";
import { updateFinanceClient } from "../services/clientFinanceService.js";
import { updateRegularizeClient } from "../services/clientRegularizeService.js";
import { terminateClient } from "../services/clientTerminationService.js";
import { type ClientRouterDeps, resolveOrganizationId } from "./clientRouteHelpers.js";

export function createClientVerticalsRouter(deps: ClientRouterDeps): Router {
  const { prisma } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.patch(
    "/clients/:id/commercial",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateCommercialBodySchema, request.body);
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
    "/clients/:id/termination",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(terminationBodySchema, request.body);
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
    "/clients/:id/finance",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateFinanceBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateFinanceClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (financeiro)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/regularize",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateRegularizeBodySchema, request.body);
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
