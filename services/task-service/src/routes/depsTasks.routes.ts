import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  DepsTasksService,
  type DepsTasksService as DepsTasksServiceType,
} from "../services/depsTasksService.js";

export type DepsTasksRouteDeps = Pick<DepsTasksServiceType, "listDepartmentsWithTaskModels">;

export function createDepsTasksRoutes(service: DepsTasksRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/deps/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id } = requireAuthenticatedRequestContext(req);
        const result = await service.listDepartmentsWithTaskModels(organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar dependencias de tarefa por departamento", { err });
        next(err);
      }
    },
  );

  return router;
}

export const depsTasksRoutes: ReturnType<typeof Router> = createDepsTasksRoutes(
  new DepsTasksService(),
);
