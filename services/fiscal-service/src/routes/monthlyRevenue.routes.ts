import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  createMonthlyRevenueBodySchema,
  listMonthlyRevenuesQuerySchema,
  monthlyRevenueIdParamsSchema,
  simplesPreviewQuerySchema,
  updateMonthlyRevenueBodySchema,
} from "../schemas/monthlyRevenue.schemas.js";
import type { MonthlyRevenueService } from "../services/monthlyRevenueService.js";

export type MonthlyRevenueRouteDeps = Pick<
  MonthlyRevenueService,
  "create" | "update" | "list" | "simplesPreview"
>;

export function createMonthlyRevenueRoutes(
  service: MonthlyRevenueRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.post(
    "/revenues",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createMonthlyRevenueBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const created = await service.create({
          ...body,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao registrar receita mensal", { err });
        next(err);
      }
    },
  );

  router.get(
    "/revenues/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listMonthlyRevenuesQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(createSuccessResponse(await service.list(query, auth.organization_id)));
      } catch (err) {
        logError("Erro ao listar receitas mensais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/simples/preview",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(simplesPreviewQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(createSuccessResponse(await service.simplesPreview(query, auth.organization_id)));
      } catch (err) {
        logError("Erro ao calcular prévia do Simples", { err });
        next(err);
      }
    },
  );

  router.put(
    "/revenues/:id",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(monthlyRevenueIdParamsSchema, req.params);
        const { amount } = parseWithZod(updateMonthlyRevenueBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const updated = await service.update({
          id,
          amount,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao corrigir receita mensal", { err });
        next(err);
      }
    },
  );

  return router;
}
