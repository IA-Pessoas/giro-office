import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  importDteBodySchema,
  listDteImportsQuerySchema,
  listDteNoticesQuerySchema,
  updateDteNoticeReadingBodySchema,
} from "../schemas/dte.schemas.js";
import { DteImportService } from "../services/dteImportService.js";
import { DteNoticeService } from "../services/dteNoticeService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createDteRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const dteImportService = new DteImportService(deps.prisma);
  const dteNoticeService = new DteNoticeService(deps.prisma);

  router.post("/dte/import", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(importDteBodySchema, request.body);
      const created = await dteImportService.importNotices({
        organizationId: request.organization_id,
        userId: request.user_id,
        ...body,
      });
      response.status(201).json(createSuccessResponse(created));
    } catch (err) {
      logError("Erro ao importar avisos DTE do regularize", { err });
      next(err);
    }
  });

  router.get("/dte/imports", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listDteImportsQuerySchema, request.query);
      const page = await dteImportService.listImports({
        organizationId: request.organization_id,
        ...query,
      });
      response.json(createSuccessResponse(page));
    } catch (err) {
      logError("Erro ao listar importações DTE do regularize", { err });
      next(err);
    }
  });

  router.get("/dte/notices", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listDteNoticesQuerySchema, request.query);
      const page = await dteNoticeService.list({
        organizationId: request.organization_id,
        ...query,
      });
      response.json(createSuccessResponse(page));
    } catch (err) {
      logError("Erro ao listar avisos DTE do regularize", { err });
      next(err);
    }
  });

  router.put(
    "/dte/notices/reading",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateDteNoticeReadingBodySchema, request.body);
        const updated = await dteNoticeService.setReading({
          organizationId: request.organization_id,
          userId: request.user_id,
          id: body.id,
          pendingReading: body.pending_reading,
        });
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao alterar leitura de aviso DTE do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
