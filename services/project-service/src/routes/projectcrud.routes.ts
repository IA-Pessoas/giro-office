import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  integracaoProjectCreateBodySchema,
  integracaoProjectDeleteParamsSchema,
  integracaoProjectDetailQuerySchema,
  integracaoProjectListQuerySchema,
  integracaoProjectUpdateBodySchema,
} from "../schemas/project-crud.schemas.js";
import type { ProjectCrudService } from "../services/ProjectCrudService.js";

export type ProjectCrudRouteDeps = Pick<
  ProjectCrudService,
  "create" | "list" | "update" | "detail" | "delete"
>;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function requireAuthContext(req: Request): {
  user_id: string;
  organization_id: string;
  permission?: number;
} {
  const user_id = req.user_id;
  const organization_id = req.organization_id;
  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Usuário ou organização não identificados.");
  }
  return { user_id, organization_id, permission: req.permission };
}

export function createProjectCrudRoutes(service: ProjectCrudRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/integracao-projects",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(integracaoProjectCreateBodySchema, req.body);
        const auth = requireAuthContext(req);

        const result = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          name: body.name,
          client_id: body.client_id,
          start_date: body.start_date,
          objective: body.objective,
          sponsor_id: body.sponsor_id ?? undefined,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar projeto", { err });
        next(err);
      }
    },
  );

  router.get(
    "/integracao-projects",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const raw = {
          ref: firstQueryValue(req.body?.ref ?? req.query.ref),
          id: firstQueryValue(req.body?.id ?? req.query.id),
        };
        const query = parseWithZod(integracaoProjectListQuerySchema, raw);
        const auth = requireAuthContext(req);

        const list = await service.list(query.ref, query.id as string, auth.organization_id);

        res.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar projetos", { err });
        next(err);
      }
    },
  );

  router.put(
    "/integracao-projects",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(integracaoProjectUpdateBodySchema, req.body);
        const auth = requireAuthContext(req);

        const result = await service.update({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          project_id: body.project_id,
          name: body.name,
          start_date: body.start_date,
          end_date: body.end_date,
          objective: body.objective,
          sponsor_id: body.sponsor_id ?? undefined,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao atualizar projeto", { err });
        next(err);
      }
    },
  );

  router.get(
    "/integracao-project",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const raw = {
          project_id: firstQueryValue(req.query.project_id),
        };
        const query = parseWithZod(integracaoProjectDetailQuerySchema, raw);
        const auth = requireAuthContext(req);

        const result = await service.detail(query.project_id, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar projeto", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/integracao-project",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const raw = {
          project_id: firstQueryValue(
            req.body?.project_id !== undefined ? req.body.project_id : req.query.project_id,
          ),
        };
        const params = parseWithZod(integracaoProjectDeleteParamsSchema, raw);
        const auth = requireAuthContext(req);

        const result = await service.delete({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          project_id: params.project_id,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao excluir projeto", { err });
        next(err);
      }
    },
  );

  return router;
}
