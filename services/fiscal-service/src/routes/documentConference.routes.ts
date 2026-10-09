import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import express, { Router } from "express";

import { isAuthenticated, requireFiscalWritePermission } from "../middlewares/isAuthenticated.js";
import {
  documentConferenceBodySchema,
  invoicePdfTotalsBodySchema,
  ipiSpreadsheetConferenceBodySchema,
  sefazXmlConferenceBodySchema,
  spedConferenceBodySchema,
  xmlSelectionBodySchema,
  xmlTaxTotalsBodySchema,
} from "../schemas/documentConference.schemas.js";
import {
  compareDocumentSpreadsheets,
  documentConferenceCsvExport,
} from "../services/documentConferenceService.js";
import { invoicePdfTotalsCsvExport, sumInvoicePdfs } from "../services/invoicePdfTotalsService.js";
import {
  compareIpiSpreadsheets,
  ipiSpreadsheetConferenceCsvExport,
} from "../services/ipiSpreadsheetConferenceService.js";
import {
  compareSefazWithXml,
  sefazXmlConferenceCsvExport,
} from "../services/sefazXmlConferenceService.js";
import { compareSpedWithXml, spedConferenceCsvExport } from "../services/spedConferenceService.js";
import { selectXmlFromZip } from "../services/xmlSelectionService.js";
import { sumXmlTaxes, xmlTaxTotalsCsvExport } from "../services/xmlTaxTotalsService.js";

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

  router.post(
    "/conferences/xml-selection",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(xmlSelectionBodySchema, req.body);
        res.json(createSuccessResponse(selectXmlFromZip(body)));
      } catch (err) {
        logError("Erro ao selecionar XML de notas no ZIP", { err });
        next(err);
      }
    },
  );

  router.post(
    "/conferences/sefaz-xml",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(sefazXmlConferenceBodySchema, req.body);
        const result = compareSefazWithXml(body);
        res.json(createSuccessResponse({ ...result, ...sefazXmlConferenceCsvExport(result) }));
      } catch (err) {
        logError("Erro ao conferir CSV SEFAZ contra XML", { err });
        next(err);
      }
    },
  );

  router.post(
    "/conferences/sped-xml",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(spedConferenceBodySchema, req.body);
        const result = compareSpedWithXml(body);
        res.json(createSuccessResponse({ ...result, ...spedConferenceCsvExport(result) }));
      } catch (err) {
        logError("Erro ao conferir SPED C100/C170 contra XML", { err });
        next(err);
      }
    },
  );

  router.post(
    "/conferences/xml-taxes",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(xmlTaxTotalsBodySchema, req.body);
        const result = sumXmlTaxes(body);
        res.json(createSuccessResponse({ ...result, ...xmlTaxTotalsCsvExport(result) }));
      } catch (err) {
        logError("Erro ao somar IPI e ICMS ST de XML", { err });
        next(err);
      }
    },
  );

  router.post(
    "/conferences/ipi-spreadsheets",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(ipiSpreadsheetConferenceBodySchema, req.body);
        const result = compareIpiSpreadsheets(body);
        res.json(
          createSuccessResponse({ ...result, ...ipiSpreadsheetConferenceCsvExport(result) }),
        );
      } catch (err) {
        logError("Erro ao conferir IPI entre planilhas", { err });
        next(err);
      }
    },
  );

  router.post(
    "/conferences/invoice-pdfs",
    express.json({ limit: "1mb" }),
    isAuthenticated,
    requireFiscalWritePermission,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(invoicePdfTotalsBodySchema, req.body);
        const result = sumInvoicePdfs(body);
        res.json(createSuccessResponse({ ...result, ...invoicePdfTotalsCsvExport(result) }));
      } catch (err) {
        logError("Erro ao somar totais de faturas em PDF", { err });
        next(err);
      }
    },
  );

  return router;
}
