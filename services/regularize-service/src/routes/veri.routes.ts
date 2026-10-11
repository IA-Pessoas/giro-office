import { createSuccessResponse, error as logError, ServiceError } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router, raw } from "express";

import { VeriComparisonService } from "../services/veriComparisonService.js";
import { VERI_LIMITS, VERI_XLSX_MIME_TYPE } from "../services/veriWorkbookParser.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createVeriRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const veriComparisonService = new VeriComparisonService(deps.prisma);
  const upload = raw({ type: VERI_XLSX_MIME_TYPE, limit: VERI_LIMITS.bytes });

  router.post(
    "/veri/compare",
    (request: Request, response: Response, next: NextFunction) => {
      if (!request.is(VERI_XLSX_MIME_TYPE)) {
        next(new ServiceError(415, "Envie um arquivo XLSX."));
        return;
      }
      upload(request, response, (err) => {
        next(
          err
            ? new ServiceError(err.status === 413 ? 413 : 400, "XLSX inválido ou maior que 2 MiB.")
            : undefined,
        );
      });
    },
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        if (!Buffer.isBuffer(request.body)) throw new ServiceError(400, "Envie um arquivo XLSX.");
        const comparison = await veriComparisonService.compare({
          organizationId: request.organization_id,
          file: request.body,
        });
        response.set("Cache-Control", "no-store").json(createSuccessResponse(comparison));
      } catch (err) {
        logError("Erro ao comparar planilha Veri do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
