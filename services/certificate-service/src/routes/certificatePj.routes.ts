import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import {
  CERTIFICATE_ELEVATED_PERMISSION,
  requireCertificatePermission,
  requireCertificateReadPermission,
} from "../middlewares/requireCertificatePermission.js";
import {
  certificatePjIdParamSchema,
  certificatePjListQuerySchema,
  createCertificatePjSchema,
  updateCertificatePjSchema,
} from "../schemas/certificatePj.schemas.js";
import { CertificatePjService } from "../services/certificatePjService.js";

export function createCertificatePjRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new CertificatePjService(prisma);

  router.get("/list", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const query = parseWithZod(certificatePjListQuerySchema, request.query);
      const result = await service.listCertificatePj({
        organizationId: authContext.organization_id,
        query,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar certificados PJ", { err });
      next(err);
    }
  });

  router.get("/:id", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const result = await service.getCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
        canViewPassword: request.permission?.certificado === CERTIFICATE_ELEVATED_PERMISSION,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao buscar certificado PJ", { err });
      next(err);
    }
  });

  router.post("/", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const data = parseWithZod(createCertificatePjSchema, request.body);
      const result = await service.createCertificatePj({
        organizationId: authContext.organization_id,
        data,
      });

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar certificado PJ", { err });
      next(err);
    }
  });

  router.patch("/:id", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePjIdParamSchema, request.params);
      const data = parseWithZod(updateCertificatePjSchema, request.body);
      const result = await service.updateCertificatePj({
        id: params.id,
        organizationId: authContext.organization_id,
        data,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PJ", { err });
      next(err);
    }
  });

  return router;
}
