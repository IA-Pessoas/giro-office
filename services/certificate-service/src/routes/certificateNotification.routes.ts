import {
  createSuccessResponse,
  error as logError,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { Router } from "express";

import type { PrismaClient } from "../generated/prisma/client.js";
import { requireCertificateReadPermission } from "../middlewares/requireCertificatePermission.js";
import { CertificateNotificationService } from "../services/certificateNotificationService.js";

export function createCertificateNotificationRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const service = new CertificateNotificationService(prisma);

  router.get("/", requireCertificateReadPermission, async (request, response, next) => {
    try {
      const authContext = requireAuthenticatedRequestContext(request);
      const result = await service.listCertificateNotifications({
        organizationId: authContext.organization_id,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar notificacoes de certificados", { err });
      next(err);
    }
  });

  return router;
}
