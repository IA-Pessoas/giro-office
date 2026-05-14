import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  clientPfDetailQuerySchema,
  createClientPfBodySchema,
  listClientPfQuerySchema,
  updateClientPfBodySchema,
} from "../schemas/clientPf.schema.js";
import { ClientPfService } from "../services/clientPfService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createClientPfRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const clientPfService = new ClientPfService(deps.prisma, deps.reconciliationService);

  router.post(
    "/regularize/pf",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createClientPfBodySchema, request.body);
        const created = await clientPfService.create({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.status(201).json(createSuccessResponse(created));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/regularize/pf",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateClientPfBodySchema, request.body);
        const updated = await clientPfService.update({
          organizationId: request.organization_id,
          userId: request.user_id,
          body,
        });
        response.json(createSuccessResponse(updated));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/pf",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(clientPfDetailQuerySchema, request.query);
        const detail = await clientPfService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/pfs",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listClientPfQuerySchema, request.query);
        const list = await clientPfService.list(request.organization_id, query.status);
        response.json(createSuccessResponse(list));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
