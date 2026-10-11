import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { groupMapParamsSchema, parseSaveGroupMapBody } from "../schemas/groupMap.schemas.js";
import { GroupMapService } from "../services/groupMapService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createGroupMapRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const groupMapService = new GroupMapService(deps.prisma);

  router.get(
    "/groups/:id/map",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(groupMapParamsSchema, request.params);
        const map = await groupMapService.generate({
          organizationId: request.organization_id,
          groupId: params.id,
        });
        response.json(createSuccessResponse(map));
      } catch (err) {
        logError("Erro ao gerar mapa de grupo do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/groups/:id/map/saved",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(groupMapParamsSchema, request.params);
        const saved = await groupMapService.getSaved({
          organizationId: request.organization_id,
          groupId: params.id,
        });
        response.json(createSuccessResponse(saved));
      } catch (err) {
        logError("Erro ao ler mapa salvo de grupo do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/groups/:id/map/saved",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(groupMapParamsSchema, request.params);
        const body = parseSaveGroupMapBody(request.body);
        const saved = await groupMapService.save({
          organizationId: request.organization_id,
          userId: request.user_id,
          groupId: params.id,
          tree: body.tree,
        });
        response.json(createSuccessResponse(saved));
      } catch (err) {
        logError("Erro ao salvar mapa de grupo do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
