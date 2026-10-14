import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireTiPermission, TiPermissionLevel } from "../middlewares/requireTiPermission.js";
import {
  tiSpecificAccessUserIdParamsSchema,
  updateTiSpecificAccessBodySchema,
} from "../schemas/tiSpecificAccess.schemas.js";
import {
  listTiSpecificAccesses,
  setTiTaskCompletionAccess,
  type TiSpecificAccessDatabase,
} from "../services/tiSpecificAccessService.js";

function getContext(request: Request): { organizationId: string; userId: string } {
  if (!request.organization_id || !request.user_id) {
    throw new ServiceError(401, "Autenticação obrigatória.");
  }

  return { organizationId: request.organization_id, userId: request.user_id };
}

/** Acessos específicos do legado (#1938): só TI nível 3 lista, concede e revoga. */
export function createTiSpecificAccessRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const database = prisma as unknown as TiSpecificAccessDatabase;

  router.get(
    "/list",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const result = await listTiSpecificAccesses(database, getContext(request));

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao listar acessos específicos de TI", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:userId",
    requireTiPermission(TiPermissionLevel.Admin),
    async (request, response, next) => {
      try {
        const params = parseWithZod(tiSpecificAccessUserIdParamsSchema, request.params);
        const body = parseWithZod(updateTiSpecificAccessBodySchema, request.body);
        const result = await setTiTaskCompletionAccess(
          database,
          getContext(request),
          params.userId,
          body.task_completion,
        );

        response.status(200).json(createSuccessResponse(result));
      } catch (err: unknown) {
        logError("Erro ao atualizar acesso específico de TI", { err });
        next(err);
      }
    },
  );

  return router;
}
