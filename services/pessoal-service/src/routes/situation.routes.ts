import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createSituationBodySchema,
  listSituationQuerySchema,
  situationIdParamsSchema,
  updateSituationBodySchema,
} from "../schemas/situation.schemas.js";
import type { SituationService } from "../services/situationService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createSituationRoutes(service: SituationService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const query = parseWithZod(listSituationQuerySchema, request.query);
      const result = await service.list(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar situacoes de pessoal", { err });
      next(err);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const params = parseWithZod(situationIdParamsSchema, request.params);
      const result = await service.detail(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar situacao de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createSituationBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar situacao de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(situationIdParamsSchema, request.params);
      const body = parseWithZod(updateSituationBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar situacao de pessoal", { err });
      next(err);
    }
  });

  return router;
}
