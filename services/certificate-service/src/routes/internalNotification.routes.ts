import {
  createSuccessResponse,
  INTERNAL_SERVICE_TOKEN_HEADER,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { Router } from "express";

import type { CertificateServiceEnv } from "../config/env.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { certificateNotificationRunBodySchema } from "../schemas/certificateNotification.schemas.js";
import { CertificateNotificationService } from "../services/certificateNotificationService.js";

export function createInternalNotificationRoutes(
  prisma: PrismaClient,
  env: CertificateServiceEnv,
): Router {
  const router = Router();
  const service = new CertificateNotificationService(prisma);

  router.post("/run", async (request, response, next) => {
    try {
      const token = request.get(INTERNAL_SERVICE_TOKEN_HEADER);
      if (token !== env.internalServiceToken) {
        throw new ServiceError(401, "Token interno do certificate-service inválido.");
      }

      parseWithZod(certificateNotificationRunBodySchema, request.body ?? {});
      const result = await service.runCertificateNotificationReconciliation({
        windowDays: env.notificationWindowDays,
      });

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao executar notificacoes internas de certificados", { err });
      next(err);
    }
  });

  return router;
}
