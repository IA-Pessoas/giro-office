import {
  createSuccessResponse,
  error as logError,
  normalizeModulePermission,
  parseWithZod,
  requireAuthenticatedRequestContext,
} from "@workspace/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  idempotencyKeySchema,
  projectWizardCreateBodySchema,
  projectWizardPreviewBodySchema,
} from "../schemas/projectWizard.schemas.js";
import { projectWizardExtractTasksBodySchema } from "../schemas/projectWizardExtraction.schemas.js";
import type { ProjectWizardExtractionService } from "../services/projectWizardExtractionService.js";
import type { ProjectWizardService } from "../services/projectWizardService.js";

export type ProjectWizardRouteDeps = Pick<ProjectWizardService, "create" | "preview">;
export type ProjectWizardExtractionRouteDeps = Pick<ProjectWizardExtractionService, "extractTasks">;

export interface ProjectWizardRoutesDeps {
  service: ProjectWizardRouteDeps;
  extractionService: ProjectWizardExtractionRouteDeps;
  extractionRateLimit: RequestHandler;
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
    extractionRateLimit,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = parseWithZod(projectWizardExtractTasksBodySchema, req.body);
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
