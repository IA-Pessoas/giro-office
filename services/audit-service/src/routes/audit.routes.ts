import type { Logger } from "@workspace/shared";
import type {
  AuditSearchResult,
  ForwardedAuditAuthContext,
  PlatformAuditSearchResult,
} from "@workspace/shared/audit";
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
import {
  assertAuditAdmin,
  assertAuditSearchAdmin,
  getAuthFromHeaders,
} from "../middlewares/getAuthFromHeaders.js";
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
  assertAccess: (context: ForwardedAuditAuthContext) => void = assertAuditAdmin,
): void {
  try {
    assertAccess(auth);
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
      assertAuditAdminOrLog(options.logger, request, auth, assertAuditSearchAdmin);
      const query = request.query as Record<string, unknown>;
      let result: AuditSearchResult | PlatformAuditSearchResult;
      if (auth.authKind === "platform") {
        if (auth.platformRole !== "super_admin") {
          throw new ServiceError(403, "Acesso negado para esta rota.");
        }
        result = await auditRequestService.searchPlatform(query);
      } else {
        if (!auth.organizationId) {
          throw new ServiceError(403, "Acesso negado para esta rota.");
        }
        result = await auditRequestService.search(query, auth.organizationId);
      }

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
      if (!auth.organizationId) {
        throw new ServiceError(403, "Acesso negado para esta rota.");
      }
      const item = await auditRequestService.findByRequestId(
        request.params.requestId,
        auth.organizationId,
      );

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
