import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  MarketingPermissionLevel,
  requireMarketingPermission,
} from "../middlewares/requireMarketingPermission.js";

export const MARKETING_EVENT_STATUSES = [
  "Novo",
  "Em andamento",
  "Concluído",
  "Descontinuado",
] as const;

export const MARKETING_EVENT_PRIORITIES = ["Baixa", "Média", "Alta"] as const;

const marketingEventIdParamsSchema = z.object({
  id: z.string().uuid({ message: "Identificador do evento inválido." }),
});

const createMarketingEventBodySchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do evento.").max(50),
    logo: z.string().max(100).optional().default(""),
    status: z.enum(MARKETING_EVENT_STATUSES).optional().default("Novo"),
    priority: z.enum(MARKETING_EVENT_PRIORITIES),
    objective: z.string().optional().default(""),
    audience: z.string().optional().default(""),
  })
  .strict();

const updateMarketingEventBodySchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do evento.").max(50).optional(),
    logo: z.string().max(100).optional(),
    status: z.enum(MARKETING_EVENT_STATUSES).optional(),
    priority: z.enum(MARKETING_EVENT_PRIORITIES).optional(),
    objective: z.string().optional(),
    audience: z.string().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

export interface MarketingEvent {
  id: string;
  name: string;
  logo: string;
  status: string;
  priority: string;
  objective: string;
  audience: string;
}

export type CreateMarketingEventInput = z.infer<typeof createMarketingEventBodySchema>;
export type UpdateMarketingEventInput = z.infer<typeof updateMarketingEventBodySchema>;

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
