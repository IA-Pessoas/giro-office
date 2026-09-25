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
  createFiscalRateBodySchema,
  fiscalRateIdParamsSchema,
  listFiscalRatesQuerySchema,
} from "../schemas/fiscalRate.schemas.js";
import { renderFiscalRatePdf } from "../services/fiscalRatePdfService.js";
import type { FiscalRateService } from "../services/fiscalRateService.js";

export type FiscalRateRouteDeps = Pick<FiscalRateService, "create" | "list" | "get">;

export function createFiscalRateRoutes(service: FiscalRateRouteDeps): ReturnType<typeof Router> {
  const router = Router();

  router.post(
    "/rates",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createFiscalRateBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const created = await service.create({
          ...body,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao registrar alíquota fiscal", { err });
        next(err);
      }
    },
  );

  router.get(
    "/rates/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listFiscalRatesQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(createSuccessResponse(await service.list(query, auth.organization_id)));
      } catch (err) {
        logError("Erro ao listar alíquotas fiscais", { err });
        next(err);
      }
    },
  );

  router.get(
    "/rates/:id/pdf",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(fiscalRateIdParamsSchema, req.params);
        const auth = requireAuthenticatedRequestContext(req);
        const rate = await service.get(id, auth.organization_id);
        const pdf = await renderFiscalRatePdf(rate);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="aliquota-${rate.tax_type}-${rate.competence}-${rate.id}.pdf"`,
        );
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(pdf);
      } catch (err) {
        logError("Erro ao gerar PDF de alíquota fiscal", { err });
        next(err);
      }
    },
  );

  return router;
}
