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
import type {
  CreateMarketingEventInput,
  MarketingEventPriority,
  MarketingEventStatus,
  UpdateMarketingEventInput,
} from "../schemas/marketingEvent.schemas.js";
import {
  createMarketingEventBodySchema,
  marketingEventIdParamsSchema,
  updateMarketingEventBodySchema,
} from "../schemas/marketingEvent.schemas.js";

export interface MarketingEvent {
  id: string;
  name: string;
  logo: string;
  status: MarketingEventStatus;
  priority: MarketingEventPriority;
  objective: string;
  audience: string;
}

export interface MarketingEventsProvider {
  listEvents(organizationId: string): Promise<MarketingEvent[]>;
  createEvent(organizationId: string, input: CreateMarketingEventInput): Promise<MarketingEvent>;
  updateEvent(
    organizationId: string,
    eventId: string,
    input: UpdateMarketingEventInput,
  ): Promise<MarketingEvent | null>;
}

export function createMarketingEventsRoutes(
  eventsService: MarketingEventsProvider,
  authenticate: import("express").RequestHandler,
): Router {
  const router = Router();

  router.get(
    "/events/list",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Viewer),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const events = await eventsService.listEvents(organizationId);
        response.json(createSuccessResponse(events));
      } catch (error: unknown) {
        logError("Falha ao consultar eventos do Marketing.", { err: error });
        next(error);
      }
    },
  );

  router.post(
    "/events",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const body = parseWithZod(createMarketingEventBodySchema, request.body);
        const event = await eventsService.createEvent(organizationId, body);
        response.status(201).json(createSuccessResponse(event));
      } catch (error: unknown) {
        logError("Falha ao cadastrar evento do Marketing.", { err: error });
        next(error);
      }
    },
  );

  router.put(
    "/events/:id",
    authenticate,
    requireMarketingPermission(MarketingPermissionLevel.Editor),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const { organization_id: organizationId } = requireAuthenticatedRequestContext(request);
        const { id: eventId } = parseWithZod(marketingEventIdParamsSchema, request.params);
        const body = parseWithZod(updateMarketingEventBodySchema, request.body);
        const event = await eventsService.updateEvent(organizationId, eventId, body);
        if (!event) {
          throw new ServiceError(404, "Evento não encontrado.");
        }
        response.json(createSuccessResponse(event));
      } catch (error: unknown) {
        logError("Falha ao atualizar evento do Marketing.", { err: error });
        next(error);
      }
    },
  );

  return router;
}
