import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  addGuidanceActivityBodySchema,
  addGuidancePartnerBodySchema,
  createGuidanceBodySchema,
  guidanceDetailQuerySchema,
  listGuidanceByProcessQuerySchema,
  removeGuidanceActivityBodySchema,
  removeGuidancePartnerBodySchema,
  updateGuidanceBodySchema,
} from "../schemas/guidance.schemas.js";
import { GuidanceService } from "../services/guidanceService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

const guidanceListQuerySchema = listGuidanceByProcessQuerySchema
  .extend({
    process_id: listGuidanceByProcessQuerySchema.shape.process_id.nullable().optional(),
  })
  .strict();

export function createGuidanceRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const guidanceService = new GuidanceService(deps.prisma);

  router.post("/guidance", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createGuidanceBodySchema, request.body);
      const created = await guidanceService.create({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.status(201).json(createSuccessResponse(created));
    } catch (err) {
      logError("Erro ao criar orientacao do regularize", { err });
      next(err);
    }
  });

  router.put("/guidance", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(updateGuidanceBodySchema, request.body);
      const updated = await guidanceService.update({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar orientacao do regularize", { err });
      next(err);
    }
  });

  router.get(
    "/guidance/detail",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(guidanceDetailQuerySchema, request.query);
        const detail = await guidanceService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar orientacao do regularize", { err });
        next(err);
      }
    },
  );

  router.get("/guidance/list", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const rawQuery = request.query as Record<string, unknown>;
      const normalizedQuery =
        rawQuery.process_id === "" ? { ...rawQuery, process_id: null } : rawQuery;
      const query = parseWithZod(guidanceListQuerySchema, normalizedQuery);
      const list = await guidanceService.listByProcess(
        request.organization_id,
        query.process_id ?? undefined,
      );
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar orientacoes do regularize", { err });
      next(err);
    }
  });

  router.post(
    "/guidance/activity/add",
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
      } catch (err) {
        logError("Erro ao adicionar atividade em orientacao do regularize", { err });
        next(err);
      }
    },
  );

  router.post(
    "/guidance/activity/remove",
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
      } catch (err) {
        logError("Erro ao remover atividade de orientacao do regularize", { err });
        next(err);
      }
    },
  );

  router.post(
    "/guidance/partner/add",
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
      } catch (err) {
        logError("Erro ao adicionar socio em orientacao do regularize", { err });
        next(err);
      }
    },
  );

  router.post(
    "/guidance/partner/remove",
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
      } catch (err) {
        logError("Erro ao remover socio de orientacao do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
