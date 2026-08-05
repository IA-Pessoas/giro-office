import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createPasswordBodySchema,
  listPasswordsQuerySchema,
  passwordIdParamsSchema,
  updatePasswordBodySchema,
} from "../schemas/password.schemas.js";
import type { PasswordService } from "../services/passwordService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createPasswordRoutes(service: PasswordService): Router {
  const router = Router();

  router.get("/", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const query = parseWithZod(listPasswordsQuerySchema, request.query);
      const result = await service.list(context, query);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao listar senhas de pessoal", { err });
      next(err);
    }
  });

  router.get("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(passwordIdParamsSchema, request.params);
      const result = await service.detail(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar senha de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createPasswordBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar senha de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(passwordIdParamsSchema, request.params);
      const body = parseWithZod(updatePasswordBodySchema, request.body);
      const result = await service.update(context, params.id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar senha de pessoal", { err });
      next(err);
    }
  });

  router.delete("/:id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(passwordIdParamsSchema, request.params);
      const result = await service.delete(context, params.id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao remover senha de pessoal", { err });
      next(err);
    }
  });

  return router;
}
