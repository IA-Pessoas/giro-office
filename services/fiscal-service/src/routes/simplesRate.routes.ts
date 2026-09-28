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
  simplesBatchBodySchema,
  simplesPdfQuerySchema,
  simplesPreviewQuerySchema,
} from "../schemas/simplesRate.schemas.js";
import { renderSimplesRateCsv, simplesRateCsvFileName } from "../services/simplesRateCsvService.js";
import { renderSimplesRatePdf, simplesRatePdfHeaders } from "../services/simplesRatePdfService.js";
import type { SimplesRateService } from "../services/simplesRateService.js";

export type SimplesRateRouteDeps = Pick<SimplesRateService, "preview" | "emission" | "batch">;

export function createSimplesRateRoutes(service: SimplesRateRouteDeps): ReturnType<typeof Router> {
  const router = Router();

  router.get(
    "/simples/preview",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(simplesPreviewQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        res.json(createSuccessResponse(await service.preview(query, auth.organization_id)));
      } catch (err) {
        logError("Erro ao calcular prévia do Simples", { err });
        next(err);
      }
    },
  );

  router.get(
    "/simples/pdf",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(simplesPdfQuerySchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        const emission = await service.emission(query, auth.organization_id);
        const pdf = await renderSimplesRatePdf(emission);
        res.set(simplesRatePdfHeaders(emission)).status(200).send(pdf);
      } catch (err) {
        logError("Erro ao emitir PDF de alíquota do Simples", { err });
        next(err);
      }
    },
  );

  router.post(
    "/simples/csv",
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(simplesBatchBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const batch = await service.batch(body, auth.organization_id);
        res.json(
          createSuccessResponse({
            ...batch,
            file_name: simplesRateCsvFileName(batch),
            csv: renderSimplesRateCsv(batch),
          }),
        );
      } catch (err) {
        logError("Erro ao exportar CSV de alíquotas do Simples", { err });
        next(err);
      }
    },
  );

  return router;
}
