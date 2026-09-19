import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { createMemoryUploadMiddleware } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  createLicenseBodySchema,
  licenseDetailQuerySchema,
  licenseProtocolParamsSchema,
  listLicensesQuerySchema,
  updateLicenseBodySchema,
} from "../schemas/license.schemas.js";
import {
  LICENSE_PROTOCOL_MAX_SIZE_BYTES,
  validateLicenseProtocolUploadFile,
} from "../services/licenseProtocolStorage.js";
import { LicenseService } from "../services/licenseService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createLicenseRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const licenseService = new LicenseService(
    deps.prisma,
    deps.reconciliationService,
    deps.protocolStorage,
  );
  const upload = createMemoryUploadMiddleware({
    maxSizeBytes: LICENSE_PROTOCOL_MAX_SIZE_BYTES,
    allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    maxSizeErrorMessage: "Arquivo do protocolo excede o limite de 10 MB.",
    mimeTypeErrorMessage: "Formato do protocolo não permitido.",
  });

  router.post("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createLicenseBodySchema, request.body);
      const created = await licenseService.create({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.status(201).json(createSuccessResponse(created));
    } catch (err) {
      logError("Erro ao criar licenca do regularize", { err });
      next(err);
    }
  });

  router.put("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(updateLicenseBodySchema, request.body);
      const updated = await licenseService.update({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar licenca do regularize", { err });
      next(err);
    }
  });

  router.get("/license", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(licenseDetailQuerySchema, request.query);
      const detail = await licenseService.detail(request.organization_id, query.id);
      response.json(createSuccessResponse(detail));
    } catch (err) {
      logError("Erro ao detalhar licenca do regularize", { err });
      next(err);
    }
  });

  router.post(
    "/license/:id/protocol",
    upload.single("file"),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(licenseProtocolParamsSchema, request.params);
        const file = validateLicenseProtocolUploadFile(request.file);
        const metadata = await licenseService.replaceProtocol({
          organizationId: request.organization_id,
          userId: request.user_id,
          licenseId: params.id,
          file,
        });
        response.status(201).json(createSuccessResponse(metadata));
      } catch (err) {
        logError("Erro ao substituir protocolo de licença", { err });
        next(err);
      }
    },
  );

  router.get(
    "/license/:id/protocol",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(licenseProtocolParamsSchema, request.params);
        const access = await licenseService.createProtocolAccess({
          organizationId: request.organization_id,
          licenseId: params.id,
        });
        response.setHeader("Cache-Control", "no-store");
        response.json(createSuccessResponse(access));
      } catch (err) {
        logError("Erro ao gerar acesso ao protocolo de licença", { err });
        next(err);
      }
    },
  );

  router.get("/licenses", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listLicensesQuerySchema, request.query);
      const list = await licenseService.list({
        organizationId: request.organization_id,
        paginationRequested: request.query.page !== undefined || request.query.limit !== undefined,
        ...query,
      });
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar licencas do regularize", { err });
      next(err);
    }
  });

  return router;
}
