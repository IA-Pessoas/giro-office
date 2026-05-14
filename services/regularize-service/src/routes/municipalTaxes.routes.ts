import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createMunicipalTaxesBodySchema,
  listMunicipalTaxesQuerySchema,
  municipalTaxesDetailQuerySchema,
  updateMunicipalTaxesBodySchema,
} from "../schemas/municipalTaxes.schema.js";
import { MunicipalTaxesService } from "../services/municipalTaxesService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createMunicipalTaxesRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const municipalTaxesService = new MunicipalTaxesService(deps.prisma);

  router.post(
    "/regularize/municipal-taxes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createMunicipalTaxesBodySchema, request.body);
        const created = await municipalTaxesService.create({
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
    "/regularize/municipal-taxes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateMunicipalTaxesBodySchema, request.body);
        const updated = await municipalTaxesService.update({
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
    "/regularize/municipal-taxes-detail",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(municipalTaxesDetailQuerySchema, request.query);
        const detail = await municipalTaxesService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/municipal-taxes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listMunicipalTaxesQuerySchema, request.query);
        const list = await municipalTaxesService.list(request.organization_id, query.year);
        response.json(createSuccessResponse(list));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
