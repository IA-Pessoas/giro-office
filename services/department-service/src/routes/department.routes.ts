import {
  createSuccessResponse,
  getSingleQueryValue,
  error as logError,
  parseWithZod,
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
import { DepartmentService } from "../services/DepartmentService.js";

function requireAuthContext(req: Request): { user_id: string; organization_id: string } {
  const user_id = req.user_id;
  const organization_id = req.organization_id;

  if (!user_id || !organization_id) {
    throw new ServiceError(401, "Contexto de autenticação inválido.");
  }

  return { user_id, organization_id };
}

const router: ReturnType<typeof Router> = Router();
const departmentService = new DepartmentService();

router.get(
  "/departments",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthContext(req);
      const parsedQuery = parseWithZod(listDepartmentsQuerySchema, {
        status: getSingleQueryValue(req.query.status),
      });
      const status = parsedQuery.status;
      const result = await departmentService.list(status, organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar departamentos", { err });
      next(err);
    }
  },
);

router.get(
  "/department",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organization_id } = requireAuthContext(req);
      const parsedQuery = parseWithZod(departmentDetailQuerySchema, {
        dep_id: getSingleQueryValue(req.query.dep_id),
      });
      const { dep_id } = parsedQuery;

      const result = await departmentService.detail(dep_id, organization_id);
      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar departamento", { err });
      next(err);
    }
  },
);

router.post(
  "/departments",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const body = parseWithZod(createDepartmentBodySchema, req.body);
      const { name, color, solution } = body;

      const result = await departmentService.create({
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
  },
);

router.put(
  "/departments",
  isAuthenticated,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user_id, organization_id } = requireAuthContext(req);
      const body = parseWithZod(updateDepartmentBodySchema, req.body);
      const { dep_id, name, color, status, solution } = body;

      const result = await departmentService.update({
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
  },
);

export { router as departmentRoutes };
