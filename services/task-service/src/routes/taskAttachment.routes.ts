import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import multer from "multer";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  taskAttachmentBodySchema,
  taskAttachmentDeleteBodySchema,
  taskAttachmentListQuerySchema,
  taskAttachmentQuerySchema,
} from "../schemas/taskAttachment.schemas.js";
import type { TaskAttachmentService } from "../services/taskAttachmentService.js";
import {
  TASK_ATTACHMENT_MIME_TYPES,
  type TaskAttachmentMimeType,
} from "../services/taskAttachmentStorage.js";

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1 },
  fileFilter(_request, file, callback) {
    if (!TASK_ATTACHMENT_MIME_TYPES.includes(file.mimetype as TaskAttachmentMimeType)) {
      callback(new ServiceError(400, "Tipo de arquivo não permitido."));
      return;
    }
    callback(null, true);
  },
});

function uploadTaskAttachment(request: Request, response: Response, next: NextFunction): void {
  upload.single("file")(request, response, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new ServiceError(400, "Arquivo excede o limite de 10 MB."));
      return;
    }
    if (err) {
      next(err instanceof multer.MulterError ? new ServiceError(400, "Upload inválido.") : err);
      return;
    }
    if (!request.file) {
      next(new ServiceError(400, "Arquivo é obrigatório."));
      return;
    }
    try {
      validateUploadFileSignature(request.file);
      next();
    } catch (validationError) {
      next(validationError);
    }
  });
}

export function createTaskAttachmentRoutes(deps: {
  service: TaskAttachmentService;
  uploadRateLimit: RequestHandler;
}): Router {
  const router = Router();

  router.post(
    "/attachment",
    isAuthenticated,
    deps.uploadRateLimit,
    uploadTaskAttachment,
    async (req, res, next) => {
      try {
        const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
        const body = parseWithZod(taskAttachmentBodySchema, req.body);
        const file = req.file;
        if (!file) throw new ServiceError(400, "Arquivo é obrigatório.");
        const result = await deps.service.upload({
          user_id,
          organization_id,
          task_id: body.task_id,
          file: {
            buffer: file.buffer,
            mimetype: file.mimetype as TaskAttachmentMimeType,
            originalname: file.originalname,
          },
          integracaoLevel: normalizeModulePermission(req.modules?.integracao),
          isOwner: req.user_type === "owner",
        });
        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao anexar arquivo à tarefa", { err });
        next(err);
      }
    },
  );

  router.get("/attachment/list", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const query = parseWithZod(taskAttachmentListQuerySchema, req.query);
      res.json(
        createSuccessResponse(
          await deps.service.list({
            user_id,
            organization_id,
            task_id: query.task_id,
            integracaoLevel: normalizeModulePermission(req.modules?.integracao),
            isOwner: req.user_type === "owner",
          }),
        ),
      );
    } catch (err) {
      logError("Erro ao listar anexos da tarefa", { err });
      next(err);
    }
  });

  router.get("/attachment/access", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const query = parseWithZod(taskAttachmentQuerySchema, req.query);
      res.json(
        createSuccessResponse(
          await deps.service.createAccessUrl({
            user_id,
            organization_id,
            task_id: query.task_id,
            attachment_id: query.attachment_id,
            integracaoLevel: normalizeModulePermission(req.modules?.integracao),
            isOwner: req.user_type === "owner",
          }),
        ),
      );
    } catch (err) {
      logError("Erro ao gerar acesso ao anexo da tarefa", { err });
      next(err);
    }
  });

  router.delete("/attachment", isAuthenticated, async (req, res, next) => {
    try {
      const { user_id, organization_id } = requireAuthenticatedRequestContext(req);
      const body = parseWithZod(taskAttachmentDeleteBodySchema, req.body);
      res.json(
        createSuccessResponse(
          await deps.service.remove({
            user_id,
            organization_id,
            task_id: body.task_id,
            attachment_id: body.attachment_id,
            integracaoLevel: normalizeModulePermission(req.modules?.integracao),
            isOwner: req.user_type === "owner",
          }),
        ),
      );
    } catch (err) {
      logError("Erro ao remover anexo da tarefa", { err });
      next(err);
    }
  });

  return router;
}
