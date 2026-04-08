import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createPartnerBodySchema,
  listPartnersQuerySchema,
  partnerDetailQuerySchema,
  updatePartnerBodySchema,
} from "../schemas/partners.schema.js";
import { PartnersService } from "../services/partnersService.js";

export function createPartnersRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const partnersService = new PartnersService(deps.prisma, deps.reconciliationService);

  router.post(
    "/regularize/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createPartnerBodySchema, request.body);
        const created = await partnersService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/regularize/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updatePartnerBodySchema, request.body);
        const updated = await partnersService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/partner",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(partnerDetailQuerySchema, request.query);
        const detail = await partnersService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listPartnersQuerySchema, request.query);
        const list = await partnersService.list(
          request.organization_id,
          query.type,
          query.client_id,
        );
        response.json(createSuccessResponse(list));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
