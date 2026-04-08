import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createProcessBodySchema,
  listProcessesQuerySchema,
  processDetailQuerySchema,
  updateProcessBodySchema,
} from "../schemas/process.schema.js";
import { ProcessService } from "../services/processService.js";

export function createProcessRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const processService = new ProcessService(deps.prisma);

  router.post(
    "/regularize/process",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createProcessBodySchema, request.body);
        const created = await processService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (error) {
        logError("Erro ao criar processo do regularize", { error });
        next(error);
      }
    },
  );

  router.put(
    "/regularize/process",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateProcessBodySchema, request.body);
        const updated = await processService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        logError("Erro ao atualizar processo do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/process",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(processDetailQuerySchema, request.query);
        const detail = await processService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        logError("Erro ao detalhar processo do regularize", { error });
        next(error);
      }
    },
  );

  router.get(
    "/regularize/processes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listProcessesQuerySchema, request.query);
        const list = await processService.list(request.organization_id, query.status);
        response.json(createSuccessResponse(list));
      } catch (error) {
        logError("Erro ao listar processos do regularize", { error });
        next(error);
      }
    },
  );

  return router;
}
