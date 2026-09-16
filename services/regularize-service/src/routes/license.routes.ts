import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  createLicenseBodySchema,
  licenseDetailQuerySchema,
  listLicensesQuerySchema,
  updateLicenseBodySchema,
} from "../schemas/license.schemas.js";
import { LicenseService } from "../services/licenseService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createLicenseRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const licenseService = new LicenseService(deps.prisma, deps.reconciliationService);

  router.post("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createLicenseBodySchema, request.body);
      const created = await licenseService.create({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.status(201).json(createSuccessResponse(created));
    } catch (err) {
      logError("Erro ao criar licenca do regularize", { err });
      next(err);
    }
  });

  router.put("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(updateLicenseBodySchema, request.body);
      const updated = await licenseService.update({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar licenca do regularize", { err });
      next(err);
    }
  });

  router.get("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(licenseDetailQuerySchema, request.query);
      const detail = await licenseService.detail(request.organization_id, query.id);
      response.json(createSuccessResponse(detail));
    } catch (err) {
      logError("Erro ao detalhar licenca do regularize", { err });
      next(err);
    }
  });

  router.get("/licenses", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listLicensesQuerySchema, request.query);
      const list = await licenseService.list({
        organizationId: request.organization_id,
        paginationRequested: request.query.page !== undefined || request.query.limit !== undefined,
        ...query,
      });
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar licencas do regularize", { err });
      next(err);
    }
  });

  return router;
}
