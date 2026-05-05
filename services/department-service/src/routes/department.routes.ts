import {
  createSuccessResponse,
  getSingleQueryValue,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
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

export function createDepartmentRoutes(service: DepartmentRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/list", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireDepartmentAuthContext(req);
      const parsedQuery = parseWithZod(listDepartmentsQuerySchema, {
        status: getSingleQueryValue(req.query.status),
      });
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
      const { organization_id } = requireDepartmentAuthContext(req);
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
      const { user_id, organization_id } = requireDepartmentAuthContext(req);
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
      const { user_id, organization_id } = requireDepartmentAuthContext(req);
      const body = parseWithZod(updateDepartmentBodySchema, req.body);
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
