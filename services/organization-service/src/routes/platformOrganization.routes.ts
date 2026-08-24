import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { listOrganizationsQuerySchema } from "../schemas/organization.schemas.js";
import { requirePlatformSession } from "../security/platformAuth.js";
import { OrganizationService } from "../services/organizationService.js";

export function createPlatformOrganizationRoutes(): ReturnType<typeof Router> {
  const router = Router();
  const organizationService = new OrganizationService();

  router.get(
    "/organizations",
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listOrganizationsQuerySchema, request.query);
        const result = await organizationService.list(query);

        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar organizações pela plataforma", { err });
        next(err);
      }
    },
  );

  return router;
}
