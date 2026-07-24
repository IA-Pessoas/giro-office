import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createProcessBodySchema,
  listProcessesQuerySchema,
  processDetailQuerySchema,
  updateProcessBodySchema,
} from "../schemas/process.schemas.js";
import { ProcessService } from "../services/processService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createProcessRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const processService = new ProcessService(deps.prisma);

  router.post(
    "/process",
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
      } catch (err) {
        logError("Erro ao criar processo do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/process",
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
      } catch (err) {
        logError("Erro ao atualizar processo do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/process",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(processDetailQuerySchema, request.query);
        const detail = await processService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar processo do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/processes",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listProcessesQuerySchema, request.query);
        const list = await processService.list({
          organizationId: request.organization_id,
          paginationRequested:
            request.query.page !== undefined || request.query.limit !== undefined,
          ...query,
        });
        response.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar processos do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
