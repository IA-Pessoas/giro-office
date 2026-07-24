import { createSuccessResponse, error as logError } from "@workspace/shared";
import { Router } from "express";

import type { PessoalOverviewService } from "../services/pessoalOverviewService.js";
import { getPessoalOrganizationContext } from "./pessoalRouteContext.js";

type PessoalOverviewRoutesService = Pick<PessoalOverviewService, "getSummary">;

export function createPessoalOverviewRoutes(service: PessoalOverviewRoutesService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const result = await service.getSummary(context);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao carregar visao geral de pessoal", { err });
      next(err);
    }
  });

  return router;
}
