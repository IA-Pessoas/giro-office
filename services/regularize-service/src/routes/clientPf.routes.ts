import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  clientPfDetailQuerySchema,
  createClientPfBodySchema,
  listClientPfQuerySchema,
  updateClientPfBodySchema,
} from "../schemas/clientPf.schemas.js";
import { ClientPfService } from "../services/clientPfService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createClientPfRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const clientPfService = new ClientPfService(deps.prisma, deps.reconciliationService);

  router.post("/pf", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(createClientPfBodySchema, request.body);
      const created = await clientPfService.create({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.status(201).json(createSuccessResponse(created));
    } catch (err) {
      logError("Erro ao criar cliente PF do regularize", { err });
      next(err);
    }
  });

  router.put("/pf", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const body = parseWithZod(updateClientPfBodySchema, request.body);
      const updated = await clientPfService.update({
        organizationId: request.organization_id,
        userId: request.user_id,
        body,
      });
      response.json(createSuccessResponse(updated));
    } catch (err) {
      logError("Erro ao atualizar cliente PF do regularize", { err });
      next(err);
    }
  });

  router.get("/pf", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(clientPfDetailQuerySchema, request.query);
      const detail = await clientPfService.detail(request.organization_id, query.id);
      response.json(createSuccessResponse(detail));
    } catch (err) {
      logError("Erro ao detalhar cliente PF do regularize", { err });
      next(err);
    }
  });

  router.get("/pfs", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listClientPfQuerySchema, request.query);
      const list = await clientPfService.list({
        organizationId: request.organization_id,
        ...query,
      });
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar clientes PF do regularize", { err });
      next(err);
    }
  });

  return router;
}
