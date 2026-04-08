import { createSuccessResponse, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  createPasswordBodySchema,
  createSitePasswordBodySchema,
  listPasswordsQuerySchema,
  listSitePasswordsQuerySchema,
  passwordDetailQuerySchema,
  sitePasswordDetailQuerySchema,
  updatePasswordBodySchema,
  updateSitePasswordBodySchema,
} from "../schemas/password.schema.js";
import { PasswordService } from "../services/passwordService.js";

export function createPasswordRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const passwordService = new PasswordService(deps.prisma, deps.env.encryptionKey);

  router.post(
    "/regularize/passwords",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createPasswordBodySchema, request.body);
        const created = await passwordService.create({
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
    "/regularize/passwords",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updatePasswordBodySchema, request.body);
        const updated = await passwordService.update({
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
    "/regularize/passwords",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listPasswordsQuerySchema, request.query);
        const list = await passwordService.list(request.organization_id, query.client_id);
        response.json(createSuccessResponse(list));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/password",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(passwordDetailQuerySchema, request.query);
        const detail = await passwordService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/regularize/sites-pass",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createSitePasswordBodySchema, request.body);
        const created = await passwordService.createSite({
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
    "/regularize/sites-pass",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(updateSitePasswordBodySchema, request.body);
        const updated = await passwordService.updateSite({
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
    "/regularize/sites-pass",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listSitePasswordsQuerySchema, request.query);
        const list = await passwordService.listSites(request.organization_id, query.status);
        response.json(createSuccessResponse(list));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/regularize/sites-pass-detail",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(sitePasswordDetailQuerySchema, request.query);
        const detail = await passwordService.detailSite(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
