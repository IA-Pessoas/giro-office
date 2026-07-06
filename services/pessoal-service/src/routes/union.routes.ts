import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createUnionBodySchema,
  unionIdParamsSchema,
  updateUnionBodySchema,
} from "../schemas/union.schemas.js";
import type { UnionService } from "../services/unionService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createUnionRoutes(service: UnionService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const result = await service.list(getPessoalOrganizationContext(request));

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar sindicatos de pessoal", { err });
      next(err);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const params = parseWithZod(unionIdParamsSchema, request.params);
      const result = await service.detail(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar sindicato de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createUnionBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar sindicato de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(unionIdParamsSchema, request.params);
      const body = parseWithZod(updateUnionBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar sindicato de pessoal", { err });
      next(err);
    }
  });

  return router;
}
