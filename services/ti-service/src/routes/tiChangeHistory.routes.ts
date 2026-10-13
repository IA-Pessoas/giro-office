import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import { listTiChangeHistoryQuerySchema } from "../schemas/tiChangeHistory.schemas.js";
import {
  listTiChangeHistory,
  type TiChangeHistoryDatabase,
} from "../services/tiChangeHistoryService.js";

export function createTiChangeHistoryRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        if (!request.organization_id) {
          throw new ServiceError(401, "Autenticação obrigatória.");
        }
        const query = parseWithZod(listTiChangeHistoryQuerySchema, request.query);
        const result = await listTiChangeHistory(
          prisma as unknown as TiChangeHistoryDatabase,
          { organizationId: request.organization_id },
          query,
        );

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar histórico de alterações de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
