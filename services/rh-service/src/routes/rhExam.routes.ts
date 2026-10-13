import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  ServiceError,
} from "@workspace/shared";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";

import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  RH_MANAGEMENT_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import { createRhExamBodySchema, rhExamIdParamSchema } from "../schemas/rhExam.schemas.js";
import { RhExamService } from "../services/rhExamService.js";

export function createRhExamRouter(service = new RhExamService()): ReturnType<typeof Router> {
  const router = Router();

  router.use(isAuthenticated, requireRhPermission(RH_MANAGEMENT_PERMISSION));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) throw new ServiceError(400, "organization_id é obrigatório.");
      res.status(200).json(createSuccessResponse(await service.list(req.organization_id)));
    } catch (err) {
      logError("Erro ao listar provas discursivas", { err });
      next(err);
    }
  });

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) throw new ServiceError(400, "organization_id é obrigatório.");
      if (!req.user_id) throw new ServiceError(400, "user_id é obrigatório.");
      const body = parseWithZod(createRhExamBodySchema, req.body);
      const result = await service.create({
        ...body,
        organization_id: req.organization_id,
        created_by_id: req.user_id,
      });
      res.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar prova discursiva", { err });
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) throw new ServiceError(400, "organization_id é obrigatório.");
      const { id } = parseWithZod(rhExamIdParamSchema, req.params);
      res.status(200).json(createSuccessResponse(await service.get(req.organization_id, id)));
    } catch (err) {
      logError("Erro ao consultar prova discursiva", { err });
      next(err);
    }
  });

  router.post("/:id/open", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.organization_id) throw new ServiceError(400, "organization_id é obrigatório.");
      const { id } = parseWithZod(rhExamIdParamSchema, req.params);
      res.status(200).json(createSuccessResponse(await service.open(req.organization_id, id)));
    } catch (err) {
      logError("Erro ao abrir prova discursiva", { err });
      next(err);
    }
  });

  return router;
}

const rhExamRouter: ReturnType<typeof Router> = createRhExamRouter();

export default rhExamRouter;
