import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import {
  listPlatformUsersQuerySchema,
  platformOrganizationUsersParamsSchema,
} from "../schemas/platformUsers.schemas.js";
import { requirePlatformGatewayAuth, requirePlatformSession } from "../security/platformAuth.js";
import { PlatformUsersService } from "../services/platformUsersService.js";

export function createPlatformUsersRoutes(): ReturnType<typeof Router> {
  const router = Router();
  const platformUsersService = new PlatformUsersService();

  router.get(
    "/organizations/:organizationId/users",
    requirePlatformGatewayAuth,
    requirePlatformSession,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organizationId } = parseWithZod(
          platformOrganizationUsersParamsSchema,
          request.params,
        );
        const { skip, take, search } = parseWithZod(listPlatformUsersQuerySchema, request.query);
        const result = await platformUsersService.list({ organizationId, skip, take, search });

        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar usuarios da organizacao pela plataforma", { err });
        next(err);
      }
    },
  );

  return router;
}
