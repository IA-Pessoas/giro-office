import { createSuccessResponse, ServiceError } from "@workspace/shared";
import { type RequestHandler, Router } from "express";

import type { AuditServiceEnv } from "../config/env.js";
import {
  type AuditRequestRepository,
  createAuditRequestRepository,
} from "../integrations/prisma/audit-request-repository.js";
import { createAuditEnabledMiddleware } from "../middleware/audit-enabled.js";
import { assertAuditAdmin, getAuthFromHeaders } from "../middleware/get-auth-from-headers.js";
import { createInternalServiceTokenMiddleware } from "../middleware/internal-service-token.js";
import { createAuditRequestService } from "../services/audit-request-service.js";

interface CreateAuditRouterOptions {
  env: AuditServiceEnv;
  repository?: AuditRequestRepository;
}

function asyncRoute(
  handler: (
    request: Parameters<RequestHandler>[0],
    response: Parameters<RequestHandler>[1],
  ) => Promise<void>,
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

export function createAuditRouter({ env, repository }: CreateAuditRouterOptions): Router {
  const router = Router();

  const auditRepository = repository ?? createAuditRequestRepository();
  const auditRequestService = createAuditRequestService(auditRepository);

  const requireAuditEnabled = createAuditEnabledMiddleware(env.auditEnabled);
  const requireInternalToken = createInternalServiceTokenMiddleware(env.auditServiceToken);

  router.get("/health", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ok",
        service: "audit-service",
      }),
    );
  });

  router.get("/ready", (_request, response) => {
    response.status(200).json(
      createSuccessResponse({
        status: "ready",
        service: "audit-service",
      }),
    );
  });

  router.post(
    "/internal/audit/requests",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const requestId = await auditRequestService.create(request.body);

      response.status(201).json(
        createSuccessResponse({
          requestId,
        }),
      );
    }),
  );

  router.get(
    "/audit/requests",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const auth = getAuthFromHeaders(request);
      assertAuditAdmin(auth);
      const result = await auditRequestService.search(
        request.query as Record<string, unknown>,
        auth.organizationId,
      );

      response.status(200).json(createSuccessResponse(result));
    }),
  );

  router.get(
    "/audit/requests/:requestId",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const auth = getAuthFromHeaders(request);
      assertAuditAdmin(auth);
      const item = await auditRequestService.findByRequestId(
        request.params.requestId,
        auth.organizationId,
      );

      if (!item) {
        throw new ServiceError(404, "Registro de auditoria não encontrado.");
      }

      response.status(200).json(
        createSuccessResponse({
          item,
        }),
      );
    }),
  );

  return router;
}
