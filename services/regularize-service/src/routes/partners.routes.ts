import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createPartnerBodySchema,
  listPartnersQuerySchema,
  partnerDetailQuerySchema,
  partnerIdParamsSchema,
  updatePartnerBodySchema,
} from "../schemas/partners.schemas.js";
import { PartnersService } from "../services/partnersService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createPartnersRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const partnersService = new PartnersService(deps.prisma, deps.reconciliationService);

  router.post(
    "/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createPartnerBodySchema, request.body);
        const created = await partnersService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar socio do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updatePartnerBodySchema, request.body);
        const updated = await partnersService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar socio do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/partner",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(partnerDetailQuerySchema, request.query);
        const detail = await partnersService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar socio do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/partners",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listPartnersQuerySchema, request.query);
        const list = await partnersService.list(
          request.organization_id,
          query.type,
          query.client_id,
        );
        response.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar socios do regularize", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/partners/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(partnerIdParamsSchema, request.params);
        const deleted = await partnersService.remove({
          organizationId: request.organization_id,
          userId: request.user_id,
          id: params.id,
        });
        response.json(createSuccessResponse(deleted));
      } catch (err) {
        logError("Erro ao remover socio do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
