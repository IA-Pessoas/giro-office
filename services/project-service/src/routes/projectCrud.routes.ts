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
import {
  integracaoProjectCreateBodySchema,
  integracaoProjectDeleteParamsSchema,
  integracaoProjectDetailQuerySchema,
  integracaoProjectListQuerySchema,
  integracaoProjectUpdateBodySchema,
} from "../schemas/projectCrud.schemas.js";
import type { ProjectCrudService } from "../services/projectCrudService.js";

export type ProjectCrudRouteDeps = Pick<
  ProjectCrudService,
  "create" | "list" | "update" | "detail" | "delete"
>;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function integrationAuth(
  req: Request,
  auth: ReturnType<typeof requireAuthenticatedRequestContext>,
) {
  return {
    userId: auth.user_id,
    organizationId: auth.organization_id,
    permission: auth.permission,
    integracaoLevel: normalizeModulePermission(req.modules?.integracao),
    isOwner: req.user_type === "owner",
  } as const;
}

export function createProjectCrudRoutes(service: ProjectCrudRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(integracaoProjectCreateBodySchema, req.body);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.create({
        ...integrationAuth(req, auth),
        name: body.name,
        client_id: body.client_id,
        start_date: body.start_date,
        end_date: body.end_date,
        objective: body.objective,
        sponsor_id: body.sponsor_id ?? undefined,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar projeto", { err });
      next(err);
    }
  });

  router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = {
        ref: firstQueryValue(req.query.ref),
        id: firstQueryValue(req.query.id),
      };
      const query = parseWithZod(integracaoProjectListQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const list = await service.list(
        query.ref,
        query.id as string,
        auth.organization_id,
        integrationAuth(req, auth),
      );

      res.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar projetos", { err });
      next(err);
    }
  });

  router.put("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(integracaoProjectUpdateBodySchema, req.body);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.update({
        ...integrationAuth(req, auth),
        project_id: body.project_id,
        name: body.name,
        start_date: body.start_date,
        end_date: body.end_date,
        objective: body.objective,
        sponsor_id: body.sponsor_id ?? undefined,
        status: body.status,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar projeto", { err });
      next(err);
    }
  });

  router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = {
        project_id: firstQueryValue(req.query.project_id),
      };
      const query = parseWithZod(integracaoProjectDetailQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.detail(
        query.project_id,
        auth.organization_id,
        integrationAuth(req, auth),
      );

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar projeto", { err });
      next(err);
    }
  });

  router.delete("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = {
        project_id: firstQueryValue(
          req.body?.project_id !== undefined ? req.body.project_id : req.query.project_id,
        ),
      };
      const params = parseWithZod(integracaoProjectDeleteParamsSchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await service.delete({
        ...integrationAuth(req, auth),
        project_id: params.project_id,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao excluir projeto", { err });
      next(err);
    }
  });

  return router;
}
