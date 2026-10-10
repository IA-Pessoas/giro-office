import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  MarketingPermissionLevel,
  requireMarketingPermission,
} from "../middlewares/requireMarketingPermission.js";
import {
  createMarketingAiUsageControlBodySchema,
  createMarketingAiUsageControlsBatchBodySchema,
  importMarketingAiUsageControlsBodySchema,
  marketingAiUsageControlIdParamsSchema,
  marketingAiUsageControlQuerySchema,
  updateMarketingAiUsageControlBodySchema,
} from "../schemas/marketingAiUsageControl.schemas.js";
import type { MarketingAiUsageControlService } from "../services/marketingAiUsageControlService.js";

export type MarketingAiUsageControlProvider = Pick<
  MarketingAiUsageControlService,
  | "listEligibleUsers"
  | "createForUser"
  | "createForActiveUsers"
  | "listControls"
  | "updateAnswers"
  | "getReport"
  | "importLegacyRecords"
  | "listImportReconciliation"
>;

export function createMarketingAiUsageControlRoutes(
  controlService: MarketingAiUsageControlProvider,
  authenticate: import("express").RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/ai-usage-controls/users",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        response.json(
          createSuccessResponse(await controlService.listEligibleUsers(organizationId)),
        );
      } catch (error: unknown) {
        logError("Falha ao listar usuários elegíveis para o controle de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.post(
    "/ai-usage-controls/batch",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const body = parseWithZod(createMarketingAiUsageControlsBatchBodySchema, request.body);
        response
          .status(201)
          .json(
            createSuccessResponse(
              await controlService.createForActiveUsers(organizationId, body.competence),
            ),
          );
      } catch (error: unknown) {
        logError("Falha ao criar controles mensais de IA em lote.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.post(
    "/ai-usage-controls",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId, user_id: userId } =
          requireAuthenticatedRequestContext(request);
        const body = parseWithZod(createMarketingAiUsageControlBodySchema, request.body);
        response
          .status(201)
          .json(
            createSuccessResponse(
              await controlService.createForUser(
                organizationId,
                body.userId,
                body.competence,
                userId,
              ),
            ),
          );
      } catch (error: unknown) {
        logError("Falha ao criar controle mensal de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.get(
    "/ai-usage-controls/list",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const query = parseWithZod(marketingAiUsageControlQuerySchema, request.query);
        response.json(
          createSuccessResponse(
            await controlService.listControls(organizationId, query.competence),
          ),
        );
      } catch (error: unknown) {
        logError("Falha ao listar controles mensais de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.get(
    "/ai-usage-controls/report",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const query = parseWithZod(marketingAiUsageControlQuerySchema, request.query);
        response.json(
          createSuccessResponse(await controlService.getReport(organizationId, query.competence)),
        );
      } catch (error: unknown) {
        logError("Falha ao consultar relatório de controles de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.post(
    "/ai-usage-controls/import",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const body = parseWithZod(importMarketingAiUsageControlsBodySchema, request.body);
        response
          .status(201)
          .json(
            createSuccessResponse(
              await controlService.importLegacyRecords(organizationId, body.records),
            ),
          );
      } catch (error: unknown) {
        logError("Falha ao importar controles legados de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.get(
    "/ai-usage-controls/reconciliation",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        response.json(
          createSuccessResponse(await controlService.listImportReconciliation(organizationId)),
        );
      } catch (error: unknown) {
        logError("Falha ao consultar reconciliações de controles legados de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  router.patch(
    "/ai-usage-controls/:id",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId, user_id: userId } =
          requireAuthenticatedRequestContext(request);
        const { id } = parseWithZod(marketingAiUsageControlIdParamsSchema, request.params);
        const body = parseWithZod(updateMarketingAiUsageControlBodySchema, request.body);
        response.json(
          createSuccessResponse(
            await controlService.updateAnswers(organizationId, id, body, userId),
          ),
        );
      } catch (error: unknown) {
        logError("Falha ao salvar respostas do controle de IA.", { err: error });
        next(error instanceof Error ? error : new ServiceError(500));
      }
    },
  );

  return router;
}
