import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import {
  listTiAccessLogsQuerySchema,
  tiAccessLogUserIdParamsSchema,
} from "../schemas/tiAccessLog.schemas.js";
import { listTiAccessLogs } from "../services/tiAccessLogService.js";

export function createTiAccessLogRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/:userId",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        if (!request.organization_id) {
          throw new ServiceError(401, "Autenticação obrigatória.");
        }
        const params = parseWithZod(tiAccessLogUserIdParamsSchema, request.params);
        const query = parseWithZod(listTiAccessLogsQuerySchema, request.query);
        const result = await listTiAccessLogs(
          prisma,
          { organizationId: request.organization_id },
          params.userId,
          query,
        );

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar logs de acesso de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
