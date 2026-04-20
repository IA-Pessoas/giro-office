import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createNcmBodySchema,
  detailNcmQuerySchema,
  listNcmQuerySchema,
  updateNcmBodySchema,
} from "../schemas/ncm.schemas.js";
import type { NcmService } from "../services/ncmService.js";

export type FiscalRouteDeps = {
  ncmService: Pick<NcmService, "create" | "update" | "detail" | "list">;
};

function firstQueryValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

export function createFiscalRoutes(deps: FiscalRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  // --- NCM ---

  router.post("/ncm", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createNcmBodySchema, req.body);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await deps.ncmService.create({
        userId: auth.user_id,
        organizationId: auth.organization_id,
        permission: auth.permission,
        ...body,
      });

      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar NCM", { err });
      next(err);
    }
  });

  router.put("/ncm", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(updateNcmBodySchema, req.body);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await deps.ncmService.update({
        userId: auth.user_id,
        organizationId: auth.organization_id,
        permission: auth.permission,
        ...body,
      });

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar NCM", { err });
      next(err);
    }
  });

  router.get("/ncm", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawObj = { ncm_id: firstQueryValue(req.query.ncm_id) };
      const query = parseWithZod(detailNcmQuerySchema, rawObj);
      const auth = requireAuthenticatedRequestContext(req);

      const result = await deps.ncmService.detail(query.ncm_id, auth.organization_id);

      res.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao buscar NCM", { err });
      next(err);
    }
  });

  router.get(
    "/ncm/list",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rawObj = { ncmCodes: req.query.ncmCodes };
        const query = parseWithZod(listNcmQuerySchema, rawObj);
        const auth = requireAuthenticatedRequestContext(req);

        const result = await deps.ncmService.list(query.ncmCodes, auth.organization_id);

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar NCM", { err });
        next(err);
      }
    },
  );

  return router;
}
