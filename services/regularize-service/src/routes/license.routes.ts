import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createLicenseBodySchema,
  licenseDetailQuerySchema,
  listLicensesQuerySchema,
  updateLicenseBodySchema,
} from "../schemas/license.schema.js";
import { LicenseService } from "../services/licenseService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createLicenseRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const licenseService = new LicenseService(deps.prisma, deps.reconciliationService);

  router.post(
    "/regularize/license",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createLicenseBodySchema, request.body);
        const created = await licenseService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (error) {
        logError("Erro ao criar licença do regularize", { error });
        next(error);
      }
    },
  );

  router.put(
    "/regularize/license",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateLicenseBodySchema, request.body);
        const updated = await licenseService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao atualizar licença do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/license",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(licenseDetailQuerySchema, request.query);
        const detail = await licenseService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        logError("Erro ao detalhar licença do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/licenses",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listLicensesQuerySchema, request.query);
        const list = await licenseService.list(request.organization_id, query.status);
        response.json(createSuccessResponse(list));
      } catch (error) {
        logError("Erro ao listar licenças do regularize", { error });
        next(error);
      }
    },
  );

  return router;
}
