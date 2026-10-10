import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { groupMapParamsSchema } from "../schemas/groupMap.schemas.js";
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

  return router;
}
