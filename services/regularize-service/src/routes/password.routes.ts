import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
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

const MIN_SITE_PASSWORD_REVEAL_PERMISSION = 2;

function assertCanRevealSitePassword(permission: number | undefined): void {
  if (Number(permission ?? 0) < MIN_SITE_PASSWORD_REVEAL_PERMISSION) {
    throw new ServiceError(403, "Permissao insuficiente para revelar credencial.");
  }
}

export function createPasswordRoutes(deps: RegularizeRouteDeps): Router {
  const router = Router();
  const passwordService = new PasswordService(deps.prisma, deps.env.encryptionKey);

  router.post("/passwords", async (request: Request, response: Response, next: NextFunction) => {
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
  });

  router.put("/passwords", async (request: Request, response: Response, next: NextFunction) => {
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
  });

  router.get("/passwords", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listPasswordsQuerySchema, request.query);
      const list = await passwordService.list(request.organization_id, query.client_id);
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar senhas do regularize", { err });
      next(err);
    }
  });

  router.get("/password", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(passwordDetailQuerySchema, request.query);
      const detail = await passwordService.detail(request.organization_id, query.id);
      response.json(createSuccessResponse(detail));
    } catch (err) {
      logError("Erro ao detalhar senha do regularize", { err });
      next(err);
    }
  });

  router.post("/sites-pass", async (request: Request, response: Response, next: NextFunction) => {
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
  });

  router.put("/sites-pass", async (request: Request, response: Response, next: NextFunction) => {
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
  });

  router.get("/sites-pass", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const query = parseWithZod(listSitePasswordsQuerySchema, request.query);
      const list = await passwordService.listSites({
        organizationId: request.organization_id,
        paginationRequested: request.query.page !== undefined || request.query.limit !== undefined,
        ...query,
      });
      response.json(createSuccessResponse(list));
    } catch (err) {
      logError("Erro ao listar sites de senha do regularize", { err });
      next(err);
    }
  });

  router.get(
    "/sites-pass-detail",
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(sitePasswordDetailQuerySchema, request.query);
        assertCanRevealSitePassword(request.permission);
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
