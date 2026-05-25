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
  certificatePfIdParamSchema,
  certificatePfListQuerySchema,
  createCertificatePfSchema,
  updateCertificatePfSchema,
} from "../schemas/certificatePf.schemas.js";
import { CertificatePfService } from "../services/certificatePfService.js";

export function createCertificatePfRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new CertificatePfService(prisma);

  router.get("/list", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const query = parseWithZod(certificatePfListQuerySchema, request.query);
      const result = await service.listCertificatePf({
        organizationId: authContext.organization_id,
        query,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar certificados PF", { err });
      next(err);
    }
  });

  router.get("/:id", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePfIdParamSchema, request.params);
      const result = await service.getCertificatePf({
        id: params.id,
        organizationId: authContext.organization_id,
        canViewPassword: request.permission?.certificado === CERTIFICATE_ELEVATED_PERMISSION,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao buscar certificado PF", { err });
      next(err);
    }
  });

  router.post("/", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const data = parseWithZod(createCertificatePfSchema, request.body);
      const result = await service.createCertificatePf({
        organizationId: authContext.organization_id,
        data,
      });

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar certificado PF", { err });
      next(err);
    }
  });

  router.patch("/:id", requireCertificatePermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const params = parseWithZod(certificatePfIdParamSchema, request.params);
      const data = parseWithZod(updateCertificatePfSchema, request.body);
      const result = await service.updateCertificatePf({
        id: params.id,
        organizationId: authContext.organization_id,
        data,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar certificado PF", { err });
      next(err);
    }
  });

  return router;
}
