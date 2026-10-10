import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createLddBodySchema,
  lddIdParamsSchema,
  listLddQuerySchema,
  previewLddImportBodySchema,
  updateLddBodySchema,
} from "../schemas/ldd.schemas.js";
import type { LddService } from "../services/lddService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createLddRoutes(service: LddService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const query = parseWithZod(listLddQuerySchema, request.query);
      const result = await service.list(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar LDD de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createLddBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar LDD de pessoal", { err });
      next(err);
    }
  });

  router.post("/import/preview", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(previewLddImportBodySchema, request.body);
      const result = await service.previewImport(context, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao gerar prévia de importação de LDD", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(lddIdParamsSchema, request.params);
      const body = parseWithZod(updateLddBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar LDD de pessoal", { err });
      next(err);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(lddIdParamsSchema, request.params);
      const result = await service.delete(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao remover LDD de pessoal", { err });
      next(err);
    }
  });

  return router;
}
