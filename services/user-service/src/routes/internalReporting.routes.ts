import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { UserServiceEnv } from "../config/env.js";
import { reportingAccessContextBodySchema } from "../schemas/internalReporting.schemas.js";
import { UserService } from "../services/userService.js";

export function createInternalReportingRouter(env: UserServiceEnv): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const userService = new UserService();

  router.post(
    "/reporting/access-context",
    (request: Request, _response: Response, next: NextFunction): void => {
      if (request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.reportsInternalToken) {
        next(new ServiceError(403, "Acesso negado."));
        return;
      }
      next();
    },
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { userId, organizationId } = parseWithZod(
          reportingAccessContextBodySchema,
          request.body,
        );
        const context = await userService.getReportingAccessContext(userId, organizationId);

        response.json(createSuccessResponse(context));
      } catch (err) {
        logError("Erro ao obter contexto de acesso para relatorio", { err });
        next(err);
      }
    },
  );

  return router;
}
