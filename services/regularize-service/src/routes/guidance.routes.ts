import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  addGuidanceActivityBodySchema,
  addGuidancePartnerBodySchema,
  createGuidanceBodySchema,
  guidanceDetailQuerySchema,
  listGuidanceByProcessQuerySchema,
  removeGuidanceActivityBodySchema,
  removeGuidancePartnerBodySchema,
  updateGuidanceBodySchema,
} from "../schemas/guidance.schema.js";
import { GuidanceService } from "../services/guidanceService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createGuidanceRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const guidanceService = new GuidanceService(deps.prisma);

  router.post(
    "/regularize/guidance",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createGuidanceBodySchema, request.body);
        const created = await guidanceService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (error) {
        logError("Erro ao criar guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.put(
    "/regularize/guidance",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateGuidanceBodySchema, request.body);
        const updated = await guidanceService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao atualizar guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/guidance/detail",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(guidanceDetailQuerySchema, request.query);
        const detail = await guidanceService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        logError("Erro ao detalhar guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/guidance/list",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listGuidanceByProcessQuerySchema, request.query);
        const list = await guidanceService.listByProcess(request.organization_id, query.process_id);
        response.json(createSuccessResponse(list));
      } catch (error) {
        logError("Erro ao listar guidances do regularize", { error });
        next(error);
      }
    },
  );

  router.post(
    "/regularize/guidance/activity/add",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(addGuidanceActivityBodySchema, request.body);
        const updated = await guidanceService.addEconomicActivity({
          organizationId: request.organization_id,
          userId: request.user_id,
          guidanceId: body.guidance_id,
          activity: body.activity,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao adicionar atividade em guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.post(
    "/regularize/guidance/activity/remove",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(removeGuidanceActivityBodySchema, request.body);
        const updated = await guidanceService.removeEconomicActivity({
          organizationId: request.organization_id,
          userId: request.user_id,
          guidanceId: body.guidance_id,
          itemId: body.item_id,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao remover atividade de guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.post(
    "/regularize/guidance/partner/add",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(addGuidancePartnerBodySchema, request.body);
        const updated = await guidanceService.addPartner({
          organizationId: request.organization_id,
          userId: request.user_id,
          guidanceId: body.guidance_id,
          partner: body.partner,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao adicionar parceiro em guidance do regularize", { error });
        next(error);
      }
    },
  );

  router.post(
    "/regularize/guidance/partner/remove",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(removeGuidancePartnerBodySchema, request.body);
        const updated = await guidanceService.removePartner({
          organizationId: request.organization_id,
          userId: request.user_id,
          guidanceId: body.guidance_id,
          itemId: body.item_id,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao remover parceiro de guidance do regularize", { error });
        next(error);
      }
    },
  );

  return router;
}
