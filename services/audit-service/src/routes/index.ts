import {
  createSuccessResponse,
  isServiceError,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import type { ForwardedAuditAuthContext } from "@workspace/shared/audit";
import type { Logger } from "@workspace/shared";
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
  logger: Logger;
  repository?: AuditRequestRepository;
}

function assertAuditAdminOrLog(
  logger: Logger,
  request: Parameters<RequestHandler>[0],
  auth: ForwardedAuditAuthContext,
): void {
  try {
    assertAuditAdmin(auth);
  } catch (error) {
    if (isServiceError(error) && error.statusCode === 403) {
      logger.warn({
        event: "audit.requests.authorization.denied",
        message: "Audit request access denied",
        request: {
          id: request.get(REQUEST_ID_HEADER) ?? undefined,
          method: request.method,
          path: request.path,
        },
        auth,
      });
    }

    throw error;
  }
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

export function createAuditRouter({ env, logger, repository }: CreateAuditRouterOptions): Router {
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
      assertAuditAdminOrLog(logger, request, auth);
      const result = await auditRequestService.search(
        request.query as Record<string, unknown>,
        auth.organizationId,
      );

      logger.info({
        event: "audit.requests.search",
        message: "Audit requests fetched",
        request: {
          id: request.get(REQUEST_ID_HEADER) ?? undefined,
          method: request.method,
          path: request.path,
        },
        auth,
        data: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        },
      });

      response.status(200).json(createSuccessResponse(result));
    }),
  );

  router.get(
    "/audit/requests/:requestId",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const auth = getAuthFromHeaders(request);
      assertAuditAdminOrLog(logger, request, auth);
      const item = await auditRequestService.findByRequestId(
        request.params.requestId,
        auth.organizationId,
      );

      if (!item) {
        logger.warn({
          event: "audit.requests.lookup.not_found",
          message: "Audit request not found",
          request: {
            id: request.get(REQUEST_ID_HEADER) ?? undefined,
            method: request.method,
            path: request.path,
          },
          auth,
          data: {
            requestId: request.params.requestId,
          },
        });
        throw new ServiceError(404, "Registro de auditoria não encontrado.");
      }

      logger.info({
        event: "audit.requests.lookup",
        message: "Audit request fetched",
        request: {
          id: request.get(REQUEST_ID_HEADER) ?? undefined,
          method: request.method,
          path: request.path,
        },
        auth,
        data: {
          requestId: request.params.requestId,
        },
      });

      response.status(200).json(
        createSuccessResponse({
          item,
        }),
      );
    }),
  );

  return router;
}
