import type { Logger } from "@workspace/shared";
import type { ForwardedAuditAuthContext } from "@workspace/shared/audit";
import {
  createSuccessResponse,
  isServiceError,
  REQUEST_ID_HEADER,
  ServiceError,
} from "@workspace/shared/http";
import { type RequestHandler, Router } from "express";

import type { AuditServiceEnv } from "../config/env.js";
import {
  type AuditRequestRepository,
  createAuditRequestRepository,
} from "../integrations/prisma/auditRequestRepository.js";
import { createAuditEnabledMiddleware } from "../middlewares/auditEnabled.js";
import { assertAuditAdmin, getAuthFromHeaders } from "../middlewares/getAuthFromHeaders.js";
import { createInternalServiceTokenMiddleware } from "../middlewares/internalServiceToken.js";
import { createAuditRequestService } from "../services/auditRequestService.js";

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

function createAuditRequestContext(options: CreateAuditRouterOptions) {
  const auditRepository = options.repository ?? createAuditRequestRepository();
  const auditRequestService = createAuditRequestService(auditRepository);

  return {
    auditRequestService,
    requireAuditEnabled: createAuditEnabledMiddleware(options.env.auditEnabled),
    requireInternalToken: createInternalServiceTokenMiddleware(options.env.auditServiceToken),
  };
}

export function createAuditInternalRouter(options: CreateAuditRouterOptions): Router {
  const router = Router();
  const { auditRequestService, requireAuditEnabled, requireInternalToken } =
    createAuditRequestContext(options);

  router.post(
    "/audit/requests",
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

  return router;
}

export function createAuditPublicRouter(options: CreateAuditRouterOptions): Router {
  const router = Router();
  const { auditRequestService, requireAuditEnabled, requireInternalToken } =
    createAuditRequestContext(options);

  router.get(
    "/requests",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const auth = getAuthFromHeaders(request);
      assertAuditAdminOrLog(options.logger, request, auth);
      const result = await auditRequestService.search(
        request.query as Record<string, unknown>,
        auth,
      );

      options.logger.info({
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
    "/requests/:requestId",
    requireAuditEnabled,
    requireInternalToken,
    asyncRoute(async (request, response) => {
      const auth = getAuthFromHeaders(request);
      assertAuditAdminOrLog(options.logger, request, auth);
      const item = await auditRequestService.findByRequestId(request.params.requestId, auth);

      if (!item) {
        options.logger.warn({
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
        throw new ServiceError(404, "Registro de auditoria nao encontrado.");
      }

      options.logger.info({
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
