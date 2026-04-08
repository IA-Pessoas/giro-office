import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { DepsTasksService, type DepsTasksService as DepsTasksServiceType } from "../services/DepsTasksService.js";

function requireAuthContext(req: Request): { organization_id: string } {
  const organization_id = req.organization_id;
  if (!organization_id) {
    throw new ServiceError(401, "Organização não identificada.");
  }
  return { organization_id };
}

export type DepsTasksRouteDeps = Pick<DepsTasksServiceType, "listDepartmentsWithTaskModels">;

export function createDepsTasksRoutes(service: DepsTasksRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/integracao-depsTasks",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id } = requireAuthContext(req);
        const result = await service.listDepartmentsWithTaskModels(organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar depsTasks", { err });
        next(err);
      }
    },
  );

  return router;
}

export const depsTasksRoutes: ReturnType<typeof Router> = createDepsTasksRoutes(new DepsTasksService());

