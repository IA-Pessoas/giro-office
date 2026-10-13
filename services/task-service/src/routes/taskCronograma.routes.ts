import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { nodeDeps } from "../nodeDeps.js";
import { taskCronogramaQuerySchema } from "../schemas/taskCronograma.schemas.js";
import { TaskCronogramaService } from "../services/taskCronogramaService.js";

type CronogramaRouteService = Pick<TaskCronogramaService, "list">;

export function createTaskCronogramaRoutes(
  service: CronogramaRouteService,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/cronograma",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
        const { client_id } = parseWithZod(taskCronogramaQuerySchema, req.query);
        const isOwner = req.user_type === "owner";
        res.json(
          createSuccessResponse(
            await service.list(
              {
                organizationId: organization_id,
                userId: user_id,
                level: isOwner ? 3 : normalizeModulePermission(req.modules?.integracao),
                isOwner,
              },
              client_id,
            ),
          ),
        );
      } catch (err) {
        logError("Erro ao consultar cronograma de Integração", { err });
        next(err);
      }
    },
  );

  return router;
}

export const taskCronogramaRoutes: ReturnType<typeof Router> = createTaskCronogramaRoutes(
  new TaskCronogramaService(nodeDeps.prisma),
);
