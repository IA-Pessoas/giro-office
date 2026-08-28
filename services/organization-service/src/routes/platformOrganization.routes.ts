import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import {
  createPlatformOrganizationBodySchema,
  listPlatformOrganizationsQuerySchema,
  platformOrganizationIdParamsSchema,
  updatePlatformOrganizationLogoUrlBodySchema,
  updatePlatformOrganizationStatusBodySchema,
  updatePlatformOrganizationSubscriptionPlanBodySchema,
} from "../schemas/organization.schemas.js";
import { requirePlatformCsrf, requirePlatformSession } from "../security/platformAuth.js";
import { OrganizationService } from "../services/organizationService.js";

function getPlatformIdentity(request: Request): NonNullable<Request["platform_identity"]> {
  if (!request.platform_identity) {
    throw new ServiceError(401, "Não autenticado.");
  }
  return request.platform_identity;
}

export function createPlatformOrganizationRoutes(
  organizationService = new OrganizationService(),
): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/organizations",
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listPlatformOrganizationsQuerySchema, request.query);
        const result = await organizationService.listPlatform(query);

        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar organizações pela plataforma", { err });
        next(err);
      }
    },
  );

  router.post(
    "/organizations",
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createPlatformOrganizationBodySchema, request.body);
        const identity = getPlatformIdentity(request);
        const organization = await organizationService.createPlatform({
          name: body.name,
          cnpj: body.cnpj,
          emailCreatedBy: identity.email,
          actorPlatformUserId: identity.id,
        });

        response.status(201).json(createSuccessResponse(organization));
      } catch (err) {
        logError("Erro ao criar organização pela plataforma", { err });
        next(err);
      }
    },
  );

  router.get(
    "/organizations/:id",
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(platformOrganizationIdParamsSchema, request.params);
        const organization = await organizationService.findPlatformById(params.id);

        response.json(createSuccessResponse(organization));
      } catch (err) {
        logError("Erro ao buscar organização pela plataforma", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/organizations/:id/status",
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(platformOrganizationIdParamsSchema, request.params);
        const body = parseWithZod(updatePlatformOrganizationStatusBodySchema, request.body);
        const updated = await organizationService.updatePlatformStatus({
          id: params.id,
          status: body.status,
          expectedUpdatedAt: body.expected_updated_at,
          actorPlatformUserId: getPlatformIdentity(request).id,
        });

        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar status da organização pela plataforma", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/organizations/:id/subscription-plan",
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(platformOrganizationIdParamsSchema, request.params);
        const body = parseWithZod(
          updatePlatformOrganizationSubscriptionPlanBodySchema,
          request.body,
        );
        const updated = await organizationService.updatePlatformSubscriptionPlan({
          id: params.id,
          subscriptionPlan: body.subscription_plan,
          expectedUpdatedAt: body.expected_updated_at,
          actorPlatformUserId: getPlatformIdentity(request).id,
        });

        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar plano da organização pela plataforma", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/organizations/:id/logo-url",
    requirePlatformSession,
    requirePlatformCsrf,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(platformOrganizationIdParamsSchema, request.params);
        const body = parseWithZod(updatePlatformOrganizationLogoUrlBodySchema, request.body);
        const updated = await organizationService.updatePlatformLogoUrl({
          id: params.id,
          logoUrl: body.logo_url,
          expectedUpdatedAt: body.expected_updated_at,
          actorPlatformUserId: getPlatformIdentity(request).id,
        });

        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar logo da organização pela plataforma", { err });
        next(err);
      }
    },
  );

  return router;
}
