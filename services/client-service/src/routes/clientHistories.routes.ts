import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import type { ClientRouterDeps } from "../clientRouterDeps.js";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import { ADMIN_PERMISSION, clientIdParamsSchema } from "../schemas/client.schemas.js";
import {
  createHistoryBodySchema,
  createHistoryPendingBodySchema,
  historyIdParamsSchema,
  pendingDeleteParamsSchema,
  pendingListQuerySchema,
  updateHistoryBodySchema,
} from "../schemas/clientVerticals.schemas.js";
import {
  createClientHistory,
  createClientHistoryFileAccessUrl,
  createHistoryPending,
  deleteHistoryPending,
  getClientHistoryDetail,
  listClientHistories,
  listHistoryPending,
  updateClientHistory,
  uploadHistoryFileAndPath,
} from "../services/clientHistoryService.js";
import { resolveOrganizationId } from "../utils/organizationContext.js";

const MAX_HISTORY_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_HISTORY_FILE_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_HISTORY_FILE_SIZE_BYTES },
  fileFilter(_request, file, callback) {
    if (!ALLOWED_HISTORY_FILE_MIME_TYPES.includes(file.mimetype)) {
      callback(new ServiceError(400, "Tipo de arquivo não permitido."));
      return;
    }

    callback(null, true);
  },
});

function uploadHistoryFile(request: Request, response: Response, next: NextFunction): void {
  upload.single("file")(request, response, (err) => {
    if (!err) {
      if (request.file) {
        try {
          validateUploadFileSignature(request.file);
        } catch (validationError) {
          next(validationError);
          return;
        }
      }
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new ServiceError(400, "Arquivo excede o limite de 10 MB."));
      return;
    }

    next(err);
  });
}

export function createClientHistoriesRouter(deps: ClientRouterDeps): Router {
  const { prisma, historyStorage } = deps;
  const historyUploadRateLimit =
    deps.historyUploadRateLimit ??
    ((_request: Request, _response: Response, next: NextFunction) => next());
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/:id/histories",
    isAuthenticated,
    historyUploadRateLimit,
    uploadHistoryFile,
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
    "/:id/histories",
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
    "/:id/histories/:historyId",
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

  router.get(
    "/:id/histories/:historyId/file",
    isAuthenticated,
    async (request: Request, response: Response, next: NextFunction) => {
      try {
        const params = parseWithZod(historyIdParamsSchema, request.params);
        const organizationId = resolveOrganizationId(request, undefined);
        const url = await createClientHistoryFileAccessUrl(
          prisma,
          historyStorage,
          organizationId,
          params.id,
          params.historyId,
        );
        response.json(createSuccessResponse({ url }));
      } catch (err) {
        logError("Erro ao gerar link do anexo do histÃ³rico", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/:id/histories/:historyId",
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
    "/:id/histories/pending",
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
    "/histories/pending",
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
    "/histories/pending/:pendingId",
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
