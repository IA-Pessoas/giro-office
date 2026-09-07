import path from "node:path";

import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import multer from "multer";
import type { z } from "zod";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  idempotencyKeySchema,
  projectWizardCreateBodySchema,
  projectWizardPreviewBodySchema,
} from "../schemas/projectWizard.schemas.js";
import { projectWizardExtractTasksBodySchema } from "../schemas/projectWizardExtraction.schemas.js";
import type { ProjectWizardExtractionService } from "../services/projectWizardExtractionService.js";
import type { ProjectWizardService } from "../services/projectWizardService.js";
import { DOCX_MIME_TYPE, extractDocxText } from "../utils/docx.js";
import { extractPdfText, PDF_MIME_TYPE } from "../utils/pdf.js";

export type ProjectWizardRouteDeps = Pick<ProjectWizardService, "create" | "preview">;
export type ProjectWizardExtractionRouteDeps = Pick<ProjectWizardExtractionService, "extractTasks">;

export interface ProjectWizardRoutesDeps {
  service: ProjectWizardRouteDeps;
  extractionService: ProjectWizardExtractionRouteDeps;
  extractionRateLimit: RequestHandler;
}

const MEETING_MINUTES_UPLOAD_FIELD = "file";
const MEETING_MINUTES_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
/** Formatos aceitos por extensão; os binários trazem o extrator próprio de texto. */
const MEETING_MINUTES_FORMATS: Record<
  string,
  { mimeTypes: readonly string[]; extract?: (file: Buffer) => string }
> = {
  ".txt": { mimeTypes: ["text/plain"] },
  ".md": { mimeTypes: ["text/markdown", "text/plain", "text/x-markdown"] },
  ".docx": { mimeTypes: [DOCX_MIME_TYPE], extract: extractDocxText },
  ".pdf": { mimeTypes: [PDF_MIME_TYPE], extract: extractPdfText },
};

function meetingMinutesFormat(originalname: string) {
  return MEETING_MINUTES_FORMATS[path.extname(originalname).toLowerCase()];
}

function decodeUtf8(file: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(file);
  } catch {
    throw new ServiceError(400, "O arquivo da Ata deve conter texto UTF-8 válido.");
  }
}
type ProjectWizardExtractTasksBody = z.infer<typeof projectWizardExtractTasksBodySchema>;

const meetingMinutesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEETING_MINUTES_MAX_FILE_SIZE_BYTES, files: 1, fields: 4 },
  fileFilter(_request, file, callback) {
    if (!meetingMinutesFormat(file.originalname)?.mimeTypes.includes(file.mimetype)) {
      callback(new ServiceError(400, "Tipo de arquivo não permitido."));
      return;
    }

    callback(null, true);
  },
});

function uploadMeetingMinutes(request: Request, response: Response, next: NextFunction): void {
  if (!request.is("multipart/form-data")) {
    next();
    return;
  }

  meetingMinutesUpload.single(MEETING_MINUTES_UPLOAD_FIELD)(request, response, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      next(new ServiceError(400, "Arquivo excede o limite de 10 MB."));
      return;
    }
    if (err) {
      next(err instanceof multer.MulterError ? new ServiceError(400, "Upload inválido.") : err);
      return;
    }
    if (!request.file || request.file.size === 0) {
      next(new ServiceError(400, "O arquivo da Ata é obrigatório e não pode estar vazio."));
      return;
    }

    const file = request.file;
    try {
      const extract = meetingMinutesFormat(file.originalname)?.extract ?? decodeUtf8;
      const content = extract(file.buffer);
      if (content.includes("\0")) {
        throw new ServiceError(400, "O arquivo da Ata não pode conter NUL.");
      }
      if (!content.trim()) {
        throw new ServiceError(400, "O arquivo da Ata não contém texto.");
      }
      request.body = { ...request.body, content };
      next();
    } catch (decodeError) {
      logError("Falha ao decodificar arquivo da Ata", { err: decodeError });
      next(
        decodeError instanceof ServiceError
          ? decodeError
          : new ServiceError(400, "O arquivo da Ata não pôde ser lido."),
      );
    }
  });
}

function validateProjectWizardExtractTasksBody(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  try {
    request.body = parseWithZod(projectWizardExtractTasksBodySchema, request.body);
    next();
  } catch (err) {
    logError("Erro ao validar entrada da extração de tarefas", { err });
    next(err);
  }
}

export function createProjectWizardRoutes({
  service,
  extractionService,
  extractionRateLimit,
}: ProjectWizardRoutesDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.post(
    "/project-wizard/preview",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectWizardPreviewBodySchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const result = await service.preview({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          integracaoLevel: normalizeModulePermission(req.modules?.integracao),
          isOwner: req.user_type === "owner",
          tasks: body.tasks,
        });

        res.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao gerar prévia do wizard", { err });
        next(err);
      }
    },
  );

  router.post(
    "/project-wizard",
    isAuthenticated,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectWizardCreateBodySchema, req.body);
        const idempotencyKey = parseWithZod(idempotencyKeySchema, req.get("Idempotency-Key"));
        const auth = requireAuthenticatedRequestContext(req);

        const result = await service.create({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
          integracaoLevel: normalizeModulePermission(req.modules?.integracao),
          isOwner: req.user_type === "owner",
          userType: req.user_type,
          modules: req.modules,
          idempotencyKey,
          ...body,
        });

        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar projeto pelo wizard", { err });
        next(err);
      }
    },
  );

  router.post(
    "/project-wizard/extract-tasks",
    isAuthenticated,
    uploadMeetingMinutes,
    validateProjectWizardExtractTasksBody,
    extractionRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = req.body as ProjectWizardExtractTasksBody;
        const auth = requireAuthenticatedRequestContext(req);

        const result = await extractionService.extractTasks({
          userId: auth.user_id,
          organizationId: auth.organization_id,
          integracaoLevel: normalizeModulePermission(req.modules?.integracao),
          isOwner: req.user_type === "owner",
          ...body,
        });

        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        // A Ata e a resposta bruta da IA nunca vão para o log: apenas a mensagem do evento.
        logError("Erro ao extrair tarefas da Ata pelo wizard");
        next(err);
      }
    },
  );

  return router;
}
