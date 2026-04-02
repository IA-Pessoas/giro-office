import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { ADMIN_PERMISSION, clientIdParamsSchema } from "../schemas/client.schema.js";
import {
  createHistoryBodySchema,
  createHistoryPendingBodySchema,
  historyIdParamsSchema,
  updateHistoryBodySchema,
} from "../schemas/clientVerticals.schema.js";
import {
  createClientHistory,
  createHistoryPending,
  deleteHistoryPending,
  getClientHistoryDetail,
  listClientHistories,
  listHistoryPending,
  updateClientHistory,
  uploadHistoryFileAndPath,
} from "../services/clientHistoryService.js";
import {
  type ClientRouterDeps,
  pendingDeleteParamsSchema,
  pendingListQuerySchema,
  resolveOrganizationId,
} from "./clientRouteHelpers.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createClientHistoriesRouter(deps: ClientRouterDeps): Router {
  const { prisma, historyStorage } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/clients/:id/histories",
    isAuthenticated,
    upload.single("file"),
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const body = parseWithZod(createHistoryBodySchema, request.body);
        let filePath: string | undefined;
        const file = request.file;
        if (file) {
          filePath = await uploadHistoryFileAndPath(historyStorage, params.id, {
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
          });
        }
        const created = await createClientHistory(
          prisma,
          organizationId,
          request.user_id,
          params.id,
          {
            date: body.date,
            history: body.history,
            file: filePath ?? null,
            pending_id: body.pending_id,
          },
        );
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar histórico", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/:id/histories",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const list = await listClientHistories(prisma, organizationId, params.id);
        response.json(createSuccessResponse({ list }));
      } catch (err) {
        logError("Erro ao listar históricos", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/:id/histories/:historyId",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(historyIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const detail = await getClientHistoryDetail(prisma, organizationId, params.historyId);
        if (!detail) {
          throw new ServiceError(404, "Histórico não encontrado.");
        }
        response.json(createSuccessResponse({ detail }));
      } catch (err) {
        logError("Erro ao obter histórico", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/histories/:historyId",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(historyIdParamsSchema, request.params);
        const body = parseWithZod(updateHistoryBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateClientHistory(
          prisma,
          organizationId,
          request.user_id,
          params.historyId,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar histórico", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients/:id/histories/pending",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(createHistoryPendingBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const created = await createHistoryPending(
          prisma,
          organizationId,
          request.user_id,
          params.id,
          body.reason,
        );
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar pendência de histórico", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/histories/pending",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(pendingListQuerySchema, request.query);
        const organizationId = resolveOrganizationId(request, undefined);
        const list = await listHistoryPending(prisma, organizationId, query.user_id);
        response.json(createSuccessResponse({ list }));
      } catch (err) {
        logError("Erro ao listar pendências de histórico", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/clients/histories/pending/:pendingId",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        if (request.permission !== ADMIN_PERMISSION) {
          throw new ServiceError(403, "Usuário não tem permissão.");
        }
        const params = parseWithZod(pendingDeleteParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        await deleteHistoryPending(prisma, organizationId, params.pendingId);
        response.json(createSuccessResponse({ ok: true }));
      } catch (err) {
        logError("Erro ao remover pendência de histórico", { err });
        next(err);
      }
    },
  );

  return router;
}
