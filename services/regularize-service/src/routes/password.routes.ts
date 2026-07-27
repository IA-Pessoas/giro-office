import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import {
  isAuthenticated,
  requireRegularizeCredentialRevealPermission,
} from "../middlewares/isAuthenticated.js";
import {
  createPasswordBodySchema,
  createSitePasswordBodySchema,
  listPasswordsQuerySchema,
  listSitePasswordsQuerySchema,
  passwordDetailQuerySchema,
  sitePasswordDetailQuerySchema,
  updatePasswordBodySchema,
  updateSitePasswordBodySchema,
} from "../schemas/password.schemas.js";
import { PasswordService } from "../services/passwordService.js";
import type { RegularizeRouteDeps } from "./regularizeRouteDeps.js";

export function createPasswordRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const passwordService = new PasswordService(deps.prisma, deps.env.encryptionKey);

  router.post(
    "/passwords",
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
      } catch (err) {
        logError("Erro ao criar senha do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/passwords",
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
      } catch (err) {
        logError("Erro ao atualizar senha do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/passwords",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listPasswordsQuerySchema, request.query);
        const list = await passwordService.list(request.organization_id, query.client_id);
        response.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar senhas do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/password",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(passwordDetailQuerySchema, request.query);
        const detail = await passwordService.detail(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar senha do regularize", { err });
        next(err);
      }
    },
  );

  router.post(
    "/sites-pass",
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
      } catch (err) {
        logError("Erro ao criar site de senha do regularize", { err });
        next(err);
      }
    },
  );

  router.put(
    "/sites-pass",
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
      } catch (err) {
        logError("Erro ao atualizar site de senha do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/sites-pass",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listSitePasswordsQuerySchema, request.query);
        const list = await passwordService.listSites(request.organization_id, query.status);
        response.json(createSuccessResponse(list));
      } catch (err) {
        logError("Erro ao listar sites de senha do regularize", { err });
        next(err);
      }
    },
  );

  router.get(
    "/sites-pass-detail",
    isAuthenticated,
    requireRegularizeCredentialRevealPermission,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(sitePasswordDetailQuerySchema, request.query);
        const detail = await passwordService.detailSite(request.organization_id, query.id);
        response.json(createSuccessResponse(detail));
      } catch (err) {
        logError("Erro ao detalhar site de senha do regularize", { err });
        next(err);
      }
    },
  );

  return router;
}
