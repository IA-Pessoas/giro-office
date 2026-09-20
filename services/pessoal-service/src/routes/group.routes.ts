import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createGroupBodySchema,
  groupIdParamsSchema,
  updateGroupBodySchema,
} from "../schemas/group.schemas.js";
import type { GroupService } from "../services/groupService.js";
import { getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createGroupRoutes(service: GroupService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const result = await service.list(getPessoalRouteContext(request));
      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar grupos de pessoal", { err });
      next(err);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const params = parseWithZod(groupIdParamsSchema, request.params);
      const result = await service.detail(getPessoalRouteContext(request), params.id);
      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar grupo de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const body = parseWithZod(createGroupBodySchema, request.body);
      const result = await service.create(getPessoalRouteContext(request), body);
      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar grupo de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const params = parseWithZod(groupIdParamsSchema, request.params);
      const body = parseWithZod(updateGroupBodySchema, request.body);
      const result = await service.update(getPessoalRouteContext(request), params.id, body);
      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar grupo de pessoal", { err });
      next(err);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const params = parseWithZod(groupIdParamsSchema, request.params);
      const result = await service.archive(getPessoalRouteContext(request), params.id);
      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao arquivar grupo de pessoal", { err });
      next(err);
    }
  });

  router.post("/:id/reactivate", async (request, response, next) => {
    try {
      const params = parseWithZod(groupIdParamsSchema, request.params);
      const result = await service.reactivate(getPessoalRouteContext(request), params.id);
      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao reativar grupo de pessoal", { err });
      next(err);
    }
  });

  return router;
}
