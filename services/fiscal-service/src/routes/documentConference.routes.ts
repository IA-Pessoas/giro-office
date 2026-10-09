import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import express, { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import { documentConferenceBodySchema } from "../schemas/documentConference.schemas.js";
import {
  compareDocumentSpreadsheets,
  documentConferenceCsvExport,
} from "../services/documentConferenceService.js";

/**
 * Conferências de arquivos (E2): processam o que foi enviado e devolvem o resultado sem gravar
 * nada. Executar conferência é operação fiscal ordinária (nível 2), como no Worker (POST).
 * Montado antes do `express.json()` global para aceitar planilhas acima de 100 kB, até o mesmo
 * 1 MB do gateway.
 */
export function createDocumentConferenceRoutes(): ReturnType<typeof Router> {
  const router = Router();

  router.post(
    "/conferences/documents",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(documentConferenceBodySchema, req.body);
        const result = compareDocumentSpreadsheets(body);
        res.json(createSuccessResponse({ ...result, ...documentConferenceCsvExport(result) }));
      } catch (err) {
        logError("Erro ao conferir planilhas Domínio e SEFAZ", { err });
        next(err);
      }
    },
  );

  return router;
}
