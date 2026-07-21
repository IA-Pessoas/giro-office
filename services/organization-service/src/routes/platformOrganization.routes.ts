import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createOrganizationBodySchema,
  listOrganizationsQuerySchema,
  organizationIdParamsSchema,
  updatePlatformOrganizationBodySchema,
} from "../schemas/organization.schemas.js";
import { requirePlatformSuperAdmin } from "../security/platformAuth.js";
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
      requirePlatformSuperAdmin(request);
      const query = parseWithZod(
        listOrganizationsQuerySchema,
        request.query,
      ) as ListOrganizationsParams;
      const result = await organizationService.list(query);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar organizacoes via plataforma", { err });
      next(err);
    }
  },
);

router.post(
  "/",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const body = parseWithZod(createOrganizationBodySchema, request.body);
      const organization = await organizationService.create(body);

      response.status(201).json(createSuccessResponse(organization));
    } catch (err) {
      logError("Erro ao criar organizacao via plataforma", { err });
      next(err);
    }
  },
);

router.get(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const organization = await organizationService.findById(params.id);

      response.json(createSuccessResponse(organization));
    } catch (err) {
      logError("Erro ao buscar organizacao via plataforma", { err });
      next(err);
    }
  },
);

router.patch(
  "/:id",
  isAuthenticated,
  async (request: Request, response: Response, next: NextFunction) => {
    try {
      requirePlatformSuperAdmin(request);
      const params = parseWithZod(organizationIdParamsSchema, request.params);
      const body = parseWithZod(updatePlatformOrganizationBodySchema, request.body);

      if (body.status !== undefined) {
        await organizationService.updateStatus(params.id, body.status);
      }
      if (body.subscription_plan !== undefined) {
        await organizationService.updateSubscriptionPlan(params.id, body.subscription_plan);
      }
      if ("logo_url" in body) {
        await organizationService.updateLogoUrl(params.id, body.logo_url ?? null);
      }

      const organization = await organizationService.findById(params.id);
      response.json(createSuccessResponse(organization));
    } catch (err) {
      logError("Erro ao atualizar organizacao via plataforma", { err });
      next(err);
    }
  },
);

export { router as platformOrganizationRoutes };
