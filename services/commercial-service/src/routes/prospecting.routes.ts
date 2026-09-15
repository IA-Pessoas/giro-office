import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import { type Request, Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createProspectingBodySchema,
  prospectingIdParamSchema,
  updateProspectingBodySchema,
} from "../schemas/prospecting.schemas.js";
import type { CommercialProspectingService } from "../services/prospectingService.js";

export type CommercialProspectingRouteDeps = Pick<
  CommercialProspectingService,
  "archive" | "create" | "detail" | "list" | "listClients" | "update"
>;

function authContext(req: Request): {
  user_id: string;
  organization_id: string;
  audit_correlation_id?: string;
} {
  const context = requireAuthenticatedRequestContext(req, {
    statusCode: 401,
    userIdMessage: "Contexto de autenticação inválido.",
    organizationIdMessage: "Contexto de autenticação inválido.",
  }) as { user_id: string; organization_id: string };
  return {
    ...context,
    ...(req.requestId ? { audit_correlation_id: req.requestId } : {}),
  };
}

export function createProspectingRoutes(
  service: CommercialProspectingRouteDeps,
): ReturnType<typeof Router> {
  const router = Router();

  router.get("/clients", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.listClients(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      res.json(createSuccessResponse(await service.list(organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { organization_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      res.json(createSuccessResponse(await service.detail(id, organization_id)));
    } catch (error) {
      next(error);
    }
  });

  router.post("/", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const body = parseWithZod(createProspectingBodySchema, req.body);
      const result = await service.create({
        user_id,
        organization_id,
        audit_correlation_id,
        ...body,
      });
      res.status(201).json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      const body = parseWithZod(updateProspectingBodySchema, req.body);
      const result = await service.update({
        user_id,
        organization_id,
        audit_correlation_id,
        prospecting_id: id,
        ...body,
      });
      res.json(createSuccessResponse(result));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id, audit_correlation_id } = authContext(req);
      const { id } = parseWithZod(prospectingIdParamSchema, req.params);
      const result = await service.archive({
        user_id,
        organization_id,
        audit_correlation_id,
        prospecting_id: id,
      });
      res.json(createSuccessResponse(result));
    } catch (error) {
      logError("Erro na rota de arquivamento de prospecção comercial", { err: error });
      next(error);
    }
  });

  return router;
}
