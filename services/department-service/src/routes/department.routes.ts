import {
  createSuccessResponse,
  getSingleQueryValue,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createDepartmentBodySchema,
  departmentDetailQuerySchema,
  listDepartmentsQuerySchema,
  updateDepartmentBodySchema,
} from "../schemas/department.schemas.js";
import type { DepartmentService } from "../services/departmentService.js";

export type DepartmentRouteDeps = Pick<DepartmentService, "create" | "detail" | "list" | "update">;

function requireDepartmentAuthContext(req: Request): { user_id: string; organization_id: string } {
  return requireAuthenticatedRequestContext(req, {
    statusCode: 401,
    userIdMessage: "Contexto de autenticação inválido.",
    organizationIdMessage: "Contexto de autenticação inválido.",
  });
}

function requireDepartmentAdminAuthContext(req: Request): {
  user_id: string;
  organization_id: string;
} {
  const auth = requireDepartmentAuthContext(req);
  const hasModuleAdminPermission = (req.modules?.rh ?? 0) >= 3 || (req.modules?.ti ?? 0) >= 3;

  if (req.user_type !== "owner" && !hasModuleAdminPermission) {
    throw new ServiceError(403, "Usuário não tem permissão administrativa.");
  }

  return auth;
}

function requireMarketingDepartmentAuthContext(req: Request): {
  user_id: string;
  organization_id: string;
} {
  const auth = requireDepartmentAuthContext(req);
  if (req.user_type !== "owner" && (req.modules?.marketing ?? 0) < 1) {
    throw new ServiceError(403, "Usuário não tem permissão para consultar departamentos.");
  }
  return auth;
}

export function createDepartmentRoutes(service: DepartmentRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedQuery = parseWithZod(listDepartmentsQuerySchema, {
        status: getSingleQueryValue(req.query.status),
        administrative: getSingleQueryValue(req.query.administrative),
        marketing: getSingleQueryValue(req.query.marketing),
      });
      const { organization_id } = parsedQuery.administrative
        ? requireDepartmentAdminAuthContext(req)
        : parsedQuery.marketing
          ? requireMarketingDepartmentAuthContext(req)
          : requireDepartmentAuthContext(req);
      const status = parsedQuery.status;
      const result = await service.list(status, organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar departamentos", { err });
      next(err);
    }
  });

  router.get("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireDepartmentAdminAuthContext(req);
      const parsedQuery = parseWithZod(departmentDetailQuerySchema, {
        dep_id: getSingleQueryValue(req.query.dep_id),
      });
      const { dep_id } = parsedQuery;

      const result = await service.detail(dep_id, organization_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar departamento", { err });
      next(err);
    }
  });

  router.post("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireDepartmentAdminAuthContext(req);
      const body = parseWithZod(createDepartmentBodySchema, req.body);
      const { name, color, solution } = body;

      const result = await service.create({
        user_id,
        organization_id,
        name,
        color,
        solution,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar departamento", { err });
      next(err);
    }
  });

  router.put("/", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = requireDepartmentAuthContext(req);
      const body = parseWithZod(updateDepartmentBodySchema, req.body);
      const hasAdministrativePermission =
        req.user_type === "owner" || (req.modules?.rh ?? 0) >= 3 || (req.modules?.ti ?? 0) >= 3;
      const marketingColorOnly =
        (req.modules?.marketing ?? 0) >= 3 &&
        Object.keys(req.body as Record<string, unknown>).every(
          (field) => field === "dep_id" || field === "color",
        ) &&
        body.color !== undefined;

      if (!hasAdministrativePermission && !marketingColorOnly) {
        throw new ServiceError(403, "Usuário não tem permissão para atualizar departamentos.");
      }

      const { user_id, organization_id } = auth;
      const { dep_id, name, color, status, solution } = body;

      const result = await service.update({
        user_id,
        organization_id,
        dep_id,
        name,
        color,
        status,
        solution,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar departamento", { err });
      next(err);
    }
  });

  return router;
}
