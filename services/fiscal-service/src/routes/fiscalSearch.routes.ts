import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { fiscalSearchQuerySchema } from "../schemas/fiscalSearch.schemas.js";
import type { FiscalSearchService } from "../services/fiscalSearchService.js";

export type FiscalSearchRouteDeps = Pick<FiscalSearchService, "searchByNcmCode">;

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createFiscalSearchRoutes(
  service: FiscalSearchRouteDeps,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/ncm-search",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = { ncmCode: firstQueryValue(req.query.ncmCode) };
        const query = parseWithZod(fiscalSearchQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.searchByNcmCode(query.ncmCode, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro na busca fiscal por NCM", { err });
        next(err);
      }
    },
  );

  return router;
}
