import { randomUUID } from "node:crypto";

import {
  createSuccessResponse,
  FORWARDED_AUTH_PLATFORM_ROLE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";

import type { MarketingServiceEnv } from "../config/env.js";
import {
  migrationReconciliationDatasetSchema,
  migrationReconciliationOrganizationSchema,
  resolveMigrationAssociationSchema,
} from "../schemas/marketingMigrationReconciliation.schemas.js";

export interface MarketingMigrationReconciliationProvider {
  getReconciliation(organizationId: string): Promise<unknown>;
  getCanonicalEvents(organizationId: string): Promise<Array<{ id: string; name: string }>>;
  resolveAssociation(input: {
    organizationId: string;
    dataset: "eventos_edicoes";
    sourceTable: "tb_mkt.eventos_edicoes";
    sourceIdentityDigest: string;
    stepId: string;
    canonicalTargetId: string;
    actorId: string;
    requestId: string;
  }): Promise<unknown>;
}

export interface MarketingMigrationReconciliationRunnerProvider {
  reconcile(organizationId: string): Promise<unknown>;
}

export function createPlatformOperatorMiddleware(env: MarketingServiceEnv): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (
      request.get(INTERNAL_SERVICE_TOKEN_HEADER) !== env.internalServiceToken ||
      request.get(FORWARDED_AUTH_PLATFORM_ROLE_HEADER) !== "super_admin"
    ) {
      next(new ServiceError(401, "Sessão de plataforma inválida."));
      return;
    }
    const actorId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    if (!actorId) {
      next(new ServiceError(401, "Identidade do operador ausente."));
      return;
    }
    request.user_id = actorId;
    next();
  };
}

export function createMarketingMigrationReconciliationRoutes(
  provider: MarketingMigrationReconciliationProvider,
  runner: MarketingMigrationReconciliationRunnerProvider | undefined,
  env: MarketingServiceEnv,
): Router {
  const router = Router();
  const platformOperator = createPlatformOperatorMiddleware(env);

  router.get(
    "/migration-reconciliation",
    platformOperator,
    (request: Request, response: Response, next: NextFunction) => {
      const parsed = migrationReconciliationOrganizationSchema.safeParse(request.query);
      if (!parsed.success) {
        next(new ServiceError(400, "Organização inválida."));
        return;
      }
      void provider
        .getReconciliation(parsed.data.organizationId)
        .then((data) => response.status(200).json(createSuccessResponse(data)))
        .catch(next);
    },
  );

  router.get(
    "/migration-reconciliation/targets",
    platformOperator,
    (request: Request, response: Response, next: NextFunction) => {
      const parsed = migrationReconciliationOrganizationSchema.safeParse(request.query);
      if (!parsed.success) {
        next(new ServiceError(400, "Organização inválida."));
        return;
      }
      void provider
        .getCanonicalEvents(parsed.data.organizationId)
        .then((data) => response.status(200).json(createSuccessResponse({ events: data })))
        .catch(next);
    },
  );

  router.post(
    "/migration-reconciliation/:dataset/resolve",
    platformOperator,
    (request: Request, response: Response, next: NextFunction) => {
      const dataset = migrationReconciliationDatasetSchema.safeParse(request.params.dataset);
      const body = resolveMigrationAssociationSchema.safeParse(request.body);
      if (!dataset.success || dataset.data !== "eventos_edicoes" || !body.success) {
        next(new ServiceError(400, "Dados da resolução inválidos."));
        return;
      }
      const actorId = request.user_id;
      if (!actorId) {
        next(new ServiceError(401, "Identidade do operador ausente."));
        return;
      }
      void provider
        .resolveAssociation({
          ...body.data,
          dataset: dataset.data,
          actorId,
          requestId: request.requestId ?? randomUUID(),
        })
        .then((data) => response.status(201).json(createSuccessResponse(data)))
        .catch(next);
    },
  );

  router.post(
    "/migration-reconciliation/:dataset/reconcile",
    platformOperator,
    (request: Request, response: Response, next: NextFunction) => {
      const dataset = migrationReconciliationDatasetSchema.safeParse(request.params.dataset);
      const body = migrationReconciliationOrganizationSchema.safeParse(request.body);
      if (!dataset.success || !body.success) {
        next(new ServiceError(400, "Dados da reconciliação inválidos."));
        return;
      }
      if (!runner) {
        next(new ServiceError(503, "Runner de migração indisponível."));
        return;
      }
      void runner
        .reconcile(body.data.organizationId)
        .then((data) =>
          response.status(201).json(createSuccessResponse({ dataset: dataset.data, data })),
        )
        .catch(next);
    },
  );

  return router;
}
