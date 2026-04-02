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
import {
  ADMIN_PERMISSION,
  type CreateClientBody,
  clientIdParamsSchema,
  createClientBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
} from "../schemas/client.schema.js";
import {
  type CreateIntegrationBody,
  createHistoryBodySchema,
  createHistoryPendingBodySchema,
  createIntegrationBodySchema,
  historyIdParamsSchema,
  terminationBodySchema,
  updateCommercialBodySchema,
  updateFinanceBodySchema,
  updateHistoryBodySchema,
  updateIntegrationBodySchema,
  updateRegularizeBodySchema,
} from "../schemas/clientVerticals.schema.js";
import { updateCommercialClient } from "../services/clientCommercialService.js";
import { updateFinanceClient } from "../services/clientFinanceService.js";
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
  createIntegrationClient,
  updateIntegrationClient,
} from "../services/clientIntegrationService.js";
import { updateRegularizeClient } from "../services/clientRegularizeService.js";
import { terminateClient } from "../services/clientTerminationService.js";

import {
  type ClientRouterDeps,
  pendingDeleteParamsSchema,
  pendingListQuerySchema,
  resolveOrganizationId,
} from "./clientRouteHelpers.js";

const upload = multer({ storage: multer.memoryStorage() });

export function createClientRouter(deps: ClientRouterDeps): Router {
  const { clientService, prisma, historyStorage } = deps;
  const router: ReturnType<typeof Router> = Router();

  router.get(
    "/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const query = parseWithZod(listClientsQuerySchema, request.query);
        const organizationId = resolveOrganizationId(request, query.organization_id);
        const listFilters = {
          ref: query.ref,
          status: query.status,
          page: query.page ?? 1,
          pageSize: query.limit ?? 20,
          search: query.search,
        };
        const page = await clientService.listByOrganization(organizationId, listFilters);
        response.json(createSuccessResponse(page));
      } catch (err) {
        logError("Erro ao listar clientes", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients/:id/activate",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.activate(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao ativar cliente", { err });
        next(err);
      }
    },
  );

  router.delete(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        if (request.permission !== ADMIN_PERMISSION) {
          throw new ServiceError(403, "Usuário não tem permissão para desativar cliente.");
        }
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.deactivate(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao desativar cliente", { err });
        next(err);
      }
    },
  );

  router.get(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.getById(params.id, organizationId);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao obter cliente", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(createClientBodySchema, request.body) as CreateClientBody;
        const tokenOrg = request.organization_id?.trim() ? request.organization_id : undefined;
        if (tokenOrg && tokenOrg !== body.organization_id) {
          throw new ServiceError(403, "Não é permitido criar cliente em outra organização.");
        }
        const client = await clientService.create(body);
        response.status(201).json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao criar cliente", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateClientBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const client = await clientService.update(params.id, organizationId, body);
        response.json(createSuccessResponse(client));
      } catch (err) {
        logError("Erro ao atualizar cliente", { err });
        next(err);
      }
    },
  );

  router.post(
    "/clients/integration",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(
          createIntegrationBodySchema,
          request.body,
        ) as CreateIntegrationBody;
        const tokenOrg = request.organization_id?.trim() ? request.organization_id : undefined;
        if (tokenOrg && tokenOrg !== body.organization_id) {
          throw new ServiceError(403, "Integração não permitida para outra organização.");
        }
        const created = await createIntegrationClient(prisma, body);
        response.status(201).json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao criar cliente (integração)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/integration",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateIntegrationBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateIntegrationClient(prisma, params.id, organizationId, body);
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (integração)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/commercial",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateCommercialBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const userId = request.user_id;
        const updated = await updateCommercialClient(
          prisma,
          params.id,
          organizationId,
          userId,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (comercial)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/termination",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(terminationBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const created = await terminateClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(created));
      } catch (err) {
        logError("Erro ao processar distrato", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/finance",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateFinanceBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateFinanceClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (financeiro)", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/clients/:id/regularize",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(clientIdParamsSchema, request.params);
        const body = parseWithZod(updateRegularizeBodySchema, request.body);
        const organizationId = resolveOrganizationId(request, undefined);
        const updated = await updateRegularizeClient(
          prisma,
          params.id,
          organizationId,
          request.user_id,
          body,
        );
        response.json(createSuccessResponse(updated));
      } catch (err) {
        logError("Erro ao atualizar cliente (regularize)", { err });
        next(err);
      }
    },
  );

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
