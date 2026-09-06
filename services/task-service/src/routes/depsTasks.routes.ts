import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
  requireIntegracaoRouteAccess,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { taskModelOptionsQuerySchema } from "../schemas/taskModelList.schemas.js";
import {
  DepsTasksService,
  type DepsTasksService as DepsTasksServiceType,
} from "../services/depsTasksService.js";

export type DepsTasksRouteDeps = Pick<
  DepsTasksServiceType,
  "listDepartmentsWithTaskModels" | "listTaskModelOptions"
>;

export function createDepsTasksRoutes(service: DepsTasksRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/deps/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id } = requireAuthenticatedRequestContext(req);
        requireIntegracaoRouteAccess("GET", "/task/deps/list", {
          userId: req.user_id,
          level: normalizeModulePermission(req.modules?.integracao),
          organizationId: organization_id,
          isOwner: req.user_type === "owner",
        });
        const result = await service.listDepartmentsWithTaskModels(organization_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar dependencias de tarefa por departamento", { err });
        next(err);
      }
    },
  );

  router.get(
    "/deps/options",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id } = requireAuthenticatedRequestContext(req);
        requireIntegracaoRouteAccess("GET", "/task/deps/options", {
          userId: req.user_id,
          level: normalizeModulePermission(req.modules?.integracao),
          organizationId: organization_id,
          isOwner: req.user_type === "owner",
        });
        const { department_id } = parseWithZod(taskModelOptionsQuerySchema, req.query);
        const result = await service.listTaskModelOptions(organization_id, department_id);
        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar opções de modelo de tarefa", { err });
        next(err);
      }
    },
  );

  return router;
}

export const depsTasksRoutes: ReturnType<typeof Router> = createDepsTasksRoutes(
  new DepsTasksService(),
);
