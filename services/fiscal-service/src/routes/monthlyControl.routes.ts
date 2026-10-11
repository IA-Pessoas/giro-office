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
  listMonthlyControlsQuerySchema,
  monthlyControlIdParamsSchema,
  openMonthlyControlBodySchema,
  responsibleReportQuerySchema,
  transferMonthlyControlsBodySchema,
  updateMonthlyControlBodySchema,
} from "../schemas/monthlyControl.schemas.js";
import type { MonthlyControlService } from "../services/monthlyControlService.js";

export type MonthlyControlRouteDeps = Pick<
  MonthlyControlService,
  "list" | "open" | "update" | "triage" | "transfer" | "responsibles" | "responsibleReport"
>;

export function createMonthlyControlRoutes(
  service: MonthlyControlRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/monthly-controls",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listMonthlyControlsQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.list(query, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao listar controles fiscais mensais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/monthly-controls/responsibles",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.responsibles({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao listar responsáveis fiscais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/monthly-controls/responsibles-report",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(responsibleReportQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.responsibleReport(query, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao gerar o relatório Responsáveis × Empresas", { err });
        next(err);
      }
    },
  );

  router.post(
    "/monthly-controls/transfer",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(transferMonthlyControlsBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.transfer({
          ...body,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao transferir controles fiscais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/monthly-controls/:id/triage",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(monthlyControlIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.triage(id, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao consultar a Triagem do controle fiscal", { err });
        next(err);
      }
    },
  );

  router.post(
    "/monthly-controls",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(openMonthlyControlBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const result = await service.open({
          ...body,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.status(result.created ? 201 : 200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao abrir controle fiscal mensal", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/monthly-controls/:id",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(monthlyControlIdParamsSchema, req.params);
        const body = parseWithZod(updateMonthlyControlBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const updated = await service.update({
          ...body,
          id,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao alterar controle fiscal mensal", { err });
        next(err);
      }
    },
  );

  return router;
}
