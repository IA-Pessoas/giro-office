import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createOrganizationBodySchema,
  listOrganizationsQuerySchema,
  organizationIdParamsSchema,
  updateOrganizationLogoUrlBodySchema,
  updateOrganizationStatusBodySchema,
  updateOrganizationSubscriptionPlanBodySchema,
} from "../schemas/organization.schemas.js";
import {
  type ListOrganizationsParams,
  OrganizationService,
} from "../services/organizationService.js";

const router: ReturnType<typeof Router> = Router();
const organizationService = new OrganizationService();

router.get(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(
        listOrganizationsQuerySchema,
        request.query,
      ) as ListOrganizationsParams;
      const result = await organizationService.list(query);
      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar organizações", { err });
      next(err);
    }
  },
);

router.post(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createOrganizationBodySchema, request.body);
      const organization = await organizationService.create(body);
      response.status(201).json(createSuccessResponse(organization));
    } catch (err) {
      logError("Erro ao criar organização", { err });
      next(err);
    }
  },
);

router.get(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const organization = await organizationService.findById(params.id);
      response.json(createSuccessResponse(organization));
    } catch (err) {
      logError("Erro ao buscar organização", { err });
      next(err);
    }
  },
);

router.patch(
  "/:id/status",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const body = parseWithZod(updateOrganizationStatusBodySchema, request.body);
      const updated = await organizationService.updateStatus(params.id, body.status);
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar status da organização", { err });
      next(err);
    }
  },
);

router.patch(
  "/:id/subscription-plan",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const body = parseWithZod(updateOrganizationSubscriptionPlanBodySchema, request.body);
      const updated = await organizationService.updateSubscriptionPlan(
        params.id,
        body.subscription_plan,
      );
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar plano de assinatura", { err });
      next(err);
    }
  },
);

router.patch(
  "/:id/logo-url",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const body = parseWithZod(updateOrganizationLogoUrlBodySchema, request.body);
      const updated = await organizationService.updateLogoUrl(params.id, body.logo_url);
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar logo da organização", { err });
      next(err);
    }
  },
);

export default router;
