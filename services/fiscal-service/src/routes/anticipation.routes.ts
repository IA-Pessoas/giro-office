import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import express, { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  anticipationBatchIdParamsSchema,
  importAnticipationBatchBodySchema,
  listAnticipationBatchesQuerySchema,
} from "../schemas/anticipation.schemas.js";
import type { AnticipationService } from "../services/anticipationService.js";

export type AnticipationRouteDeps = Pick<AnticipationService, "importBatch" | "list" | "detail">;

/**
 * Lotes de antecipação (E3). Montado antes do `express.json()` global: o ZIP em base64 passa do
 * limite padrão de 100 kB, até o mesmo 1 MB do gateway.
 */
export function createAnticipationRoutes(
  service: AnticipationRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();
  const organizationId = (req: Request) => requireAuthenticatedRequestContext(req).organization_id;

  router.post(
    "/anticipations/batches",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(importAnticipationBatchBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const batch = await service.importBatch({
          ...body,
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.status(201).json(createSuccessResponse(batch));
      } catch (err) {
        logError("Erro ao importar lote de antecipações", { err });
        next(err);
      }
    },
  );

  router.get("/anticipations/batches/list", isAuthenticated, async (req, res, next) => {
    try {
      const query = parseWithZod(listAnticipationBatchesQuerySchema, req.query);
      res.json(createSuccessResponse(await service.list(query, organizationId(req))));
    } catch (err) {
      logError("Erro ao listar lotes de antecipações", { err });
      next(err);
    }
  });

  router.get("/anticipations/batches/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { id } = parseWithZod(anticipationBatchIdParamsSchema, req.params);
      res.json(createSuccessResponse(await service.detail(id, organizationId(req))));
    } catch (err) {
      logError("Erro ao detalhar lote de antecipações", { err });
      next(err);
    }
  });

  return router;
}
