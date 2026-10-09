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
  anticipationItemParamsSchema,
  checkAnticipationBatchBodySchema,
  importAnticipationBatchBodySchema,
  listAnticipationBatchesQuerySchema,
  submitAnticipationBatchBodySchema,
  updateAnticipationItemBodySchema,
} from "../schemas/anticipation.schemas.js";
import { renderAnticipationDemonstrative } from "../services/anticipationExportService.js";
import type { AnticipationService } from "../services/anticipationService.js";

export type AnticipationRouteDeps = Pick<
  AnticipationService,
  "importBatch" | "list" | "detail" | "updateItem" | "submit" | "check" | "demonstrative"
>;

/**
 * Lotes de antecipação (E3). Montado antes do `express.json()` global: o ZIP em base64 passa do
 * limite padrão de 100 kB, até o mesmo 1 MB do gateway; as demais rotas com corpo usam o padrão.
 */
export function createAnticipationRoutes(
  service: AnticipationRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();
  const organizationId = (req: Request) => requireAuthenticatedRequestContext(req).organization_id;
  const actor = (req: Request) => {
    const auth = requireAuthenticatedRequestContext(req);
    return {
      userId: auth.user_id,
      organizationId: auth.organization_id,
      permission: auth.permission,
    };
  };

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

  router.put(
    "/anticipations/batches/:id/items/:item_id",
    express.json(),
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, item_id } = parseWithZod(anticipationItemParamsSchema, req.params);
        const body = parseWithZod(updateAnticipationItemBodySchema, req.body);
        const item = await service.updateItem({
          ...body,
          ...actor(req),
          batchId: id,
          itemId: item_id,
        });
        res.json(createSuccessResponse(item));
      } catch (err) {
        logError("Erro ao revisar item de antecipação", { err });
        next(err);
      }
    },
  );

  router.post(
    "/anticipations/batches/:id/submit",
    express.json(),
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(anticipationBatchIdParamsSchema, req.params);
        const body = parseWithZod(submitAnticipationBatchBodySchema, req.body);
        res.json(
          createSuccessResponse(await service.submit({ ...body, ...actor(req), batchId: id })),
        );
      } catch (err) {
        logError("Erro ao enviar lote de antecipações à conferência", { err });
        next(err);
      }
    },
  );

  router.post(
    "/anticipations/batches/:id/check",
    express.json(),
    isAuthenticated,
    requireFiscalWritePermission,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = parseWithZod(anticipationBatchIdParamsSchema, req.params);
        const body = parseWithZod(checkAnticipationBatchBodySchema, req.body);
        res.json(
          createSuccessResponse(await service.check({ ...body, ...actor(req), batchId: id })),
        );
      } catch (err) {
        logError("Erro ao conferir lote de antecipações", { err });
        next(err);
      }
    },
  );

  // Demonstrativo (FIS-18): leitura, então Fiscal nível 1 também exporta.
  for (const format of ["csv", "pdf"] as const) {
    router.get(
      `/anticipations/batches/:id/${format}`,
      isAuthenticated,
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const { id } = parseWithZod(anticipationBatchIdParamsSchema, req.params);
          const demonstrative = await service.demonstrative(id, organizationId(req));
          const file = await renderAnticipationDemonstrative(demonstrative, format);
          res.set(file.headers).status(200).send(Buffer.from(file.body));
        } catch (err) {
          logError("Erro ao exportar demonstrativo de antecipações", { err });
          next(err);
        }
      },
    );
  }

  return router;
}
