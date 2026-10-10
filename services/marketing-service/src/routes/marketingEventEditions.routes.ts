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
  type MarketingEventEditionFeedbackInput,
  type MarketingEventEditionInput,
  marketingEventEditionBodySchema,
  marketingEventEditionFeedbackBodySchema,
  marketingEventEditionIdParamsSchema,
  marketingEventEditionParamsSchema,
} from "../schemas/marketingEventEdition.schemas.js";
import type {
  MarketingEventEdition,
  MarketingEventEditionFeedback,
  MarketingEventEditionReport,
} from "../services/marketingEventEditionsService.js";

export interface MarketingEventEditionsProvider {
  listEditions(organizationId: string, eventId: string): Promise<MarketingEventEdition[]>;
  createEdition(
    organizationId: string,
    eventId: string,
    input: MarketingEventEditionInput,
    actorUserId: string,
  ): Promise<MarketingEventEdition>;
  updateEdition(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionInput,
    actorUserId: string,
  ): Promise<MarketingEventEdition | null>;
  createEditionFeedback(
    organizationId: string,
    eventId: string,
    editionId: string,
    input: MarketingEventEditionFeedbackInput,
    actorUserId: string,
  ): Promise<MarketingEventEditionFeedback>;
  getEditionReport(
    organizationId: string,
    eventId: string,
    editionId: string,
  ): Promise<MarketingEventEditionReport | null>;
}

export function createMarketingEventEditionsRoutes(
  editionsService: MarketingEventEditionsProvider,
  authenticate: import("express").RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/events/:eventId/editions",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const { eventId } = parseWithZod(marketingEventEditionParamsSchema, request.params);
        const editions = await editionsService.listEditions(organizationId, eventId);
        response.json(createSuccessResponse(editions));
      } catch (error: unknown) {
        logError("Falha ao consultar edições do evento.", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/events/:eventId/editions",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId, user_id: userId } =
          requireAuthenticatedRequestContext(request);
        const { eventId } = parseWithZod(marketingEventEditionParamsSchema, request.params);
        const body = parseWithZod(marketingEventEditionBodySchema, request.body);
        const edition = await editionsService.createEdition(organizationId, eventId, body, userId);
        response.status(201).json(createSuccessResponse(edition));
      } catch (error: unknown) {
        logError("Falha ao cadastrar edição do evento.", { err: error });
        next(error);
      }
    },
  );

  router.put(
    "/events/:eventId/editions/:editionId",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId, user_id: userId } =
          requireAuthenticatedRequestContext(request);
        const { eventId, editionId } = parseWithZod(
          marketingEventEditionIdParamsSchema,
          request.params,
        );
        const body = parseWithZod(marketingEventEditionBodySchema, request.body);
        const edition = await editionsService.updateEdition(
          organizationId,
          eventId,
          editionId,
          body,
          userId,
        );
        if (!edition) throw new ServiceError(404, "Edição não encontrada.");
        response.json(createSuccessResponse(edition));
      } catch (error: unknown) {
        logError("Falha ao atualizar edição do evento.", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/events/:eventId/editions/:editionId/feedback",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId, user_id: userId } =
          requireAuthenticatedRequestContext(request);
        const { eventId, editionId } = parseWithZod(
          marketingEventEditionIdParamsSchema,
          request.params,
        );
        const body = parseWithZod(marketingEventEditionFeedbackBodySchema, request.body);
        const feedback = await editionsService.createEditionFeedback(
          organizationId,
          eventId,
          editionId,
          body,
          userId,
        );
        response.status(201).json(createSuccessResponse(feedback));
      } catch (error: unknown) {
        logError("Falha ao registrar avaliação da edição.", { err: error });
        next(error);
      }
    },
  );

  router.get(
    "/events/:eventId/editions/:editionId/report",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const { eventId, editionId } = parseWithZod(
          marketingEventEditionIdParamsSchema,
          request.params,
        );
        const report = await editionsService.getEditionReport(organizationId, eventId, editionId);
        if (!report) throw new ServiceError(404, "Edição não encontrada.");
        response.json(createSuccessResponse(report));
      } catch (error: unknown) {
        logError("Falha ao consultar relatório da edição.", { err: error });
        next(error);
      }
    },
  );

  return router;
}
