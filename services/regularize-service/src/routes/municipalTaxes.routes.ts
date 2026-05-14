import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
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
    "/municipal-taxes",
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
      } catch (err) {
        logError("Erro ao criar tributo municipal do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/municipal-taxes",
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
      } catch (err) {
        logError("Erro ao atualizar tributo municipal do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/municipal-taxes-detail",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(municipalTaxesDetailQuerySchema, request.query);
        const detail = await municipalTaxesService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar tributo municipal do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/municipal-taxes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listMunicipalTaxesQuerySchema, request.query);
        const list = await municipalTaxesService.list(request.organization_id, query.year);
        response.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar tributos municipais do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
