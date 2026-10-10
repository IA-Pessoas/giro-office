import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createObligationBodySchema,
  detailObligationQuerySchema,
  generateObligationsParamsSchema,
  listObligationPortfolioQuerySchema,
  obligationHistoryQuerySchema,
  obligationIdParamsSchema,
  updateObligationFieldBodySchema,
} from "../schemas/obligation.schemas.js";
import type { ObligationService } from "../services/obligationService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createObligationRoutes(service: ObligationService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const query = parseWithZod(detailObligationQuerySchema, request.query);
      const result = await service.detail(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar obrigacao de pessoal", { err });
      next(err);
    }
  });

  router.get("/portfolio", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const query = parseWithZod(listObligationPortfolioQuerySchema, request.query);
      const result = await service.listPortfolio(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar carteira de obrigacoes de pessoal", { err });
      next(err);
    }
  });

  router.get("/:id/history", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const params = parseWithZod(obligationIdParamsSchema, request.params);
      const query = parseWithZod(obligationHistoryQuerySchema, request.query);
      const result = await service.history(context, params.id, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao consultar historico de obrigacao de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createObligationBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(result.created ? 201 : 200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar obrigacao de pessoal", { err });
      next(err);
    }
  });

  router.post("/competences/:competence/generate", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(generateObligationsParamsSchema, request.params);
      const result = await service.generateForCompetence(context, params.competence);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao gerar obrigacoes de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(obligationIdParamsSchema, request.params);
      const body = parseWithZod(updateObligationFieldBodySchema, request.body);
      const result = await service.updateField(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar obrigacao de pessoal", { err });
      next(err);
    }
  });

  return router;
}
