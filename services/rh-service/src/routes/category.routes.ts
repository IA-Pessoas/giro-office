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
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  createCategoryBodySchema,
  deleteCategoryBodySchema,
  updateCategoryBodySchema,
} from "../schemas/category.schemas.js";
import { CategoryService } from "../services/categoryService.js";

const router: ReturnType<typeof Router> = Router();
const categoryService = new CategoryService();

router.post(
  "/",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const body = parseWithZod(createCategoryBodySchema, req.body);

      const result = await categoryService.create({
        organization_id: organizationId,
        name: body.name,
        active: body.active,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar categoria", { err });
      next(err);
    }
  },
);

router.put(
  "/",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const body = parseWithZod(updateCategoryBodySchema, req.body);

      const result = await categoryService.update({
        id: body.id,
        organization_id: organizationId,
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar categoria", { err });
      next(err);
    }
  },
);

router.get(
  "/",
  isAuthenticated,
  requireRhPermission(RH_SELF_SERVICE_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const activeOnly = req.query.activeOnly === "true";

      const result = await categoryService.list(organizationId, { activeOnly });
      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar categorias", { err });
      next(err);
    }
  },
);

router.delete(
  "/",
  isAuthenticated,
  requireRhPermission(RH_MANAGEMENT_PERMISSION),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization_id;
      const userId = req.user_id;
      if (!organizationId) {
        throw new ServiceError(400, "organization_id é obrigatório.");
      }
      if (!userId) {
        throw new ServiceError(400, "user_id é obrigatório.");
      }

      const body = parseWithZod(deleteCategoryBodySchema, req.body);

      const result = await categoryService.delete({
        id: body.id,
        organization_id: organizationId,
      });

      res.status(200).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao excluir categoria", { err });
      next(err);
    }
  },
);

export default router;
