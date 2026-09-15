import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  applyGroupAssignmentPreviewBodySchema,
  createGroupAssignmentPreviewBodySchema,
  groupAssignmentEligibleQuerySchema,
  groupAssignmentIdempotencyKeySchema,
  groupAssignmentPreviewParamsSchema,
  groupAssignmentPreviewQuerySchema,
} from "../schemas/groupAssignment.schemas.js";
import type { GroupAssignmentService } from "../services/groupAssignmentService.js";
import { getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createGroupAssignmentRoutes(service: GroupAssignmentService): Router {
  const router = Router();

  router.get("/eligible", async (request, response, next) => {
    try {
      const query = parseWithZod(groupAssignmentEligibleQuerySchema, request.query);
      response
        .status(200)
        .json(
          createSuccessResponse(await service.listEligible(getPessoalRouteContext(request), query)),
        );
    } catch (err: unknown) {
      logError("Erro ao listar folhas elegiveis para atribuicao em lote", { err });
      next(err);
    }
  });

  router.post("/previews", async (request, response, next) => {
    try {
      const body = parseWithZod(createGroupAssignmentPreviewBodySchema, request.body);
      response
        .status(201)
        .json(
          createSuccessResponse(await service.createPreview(getPessoalRouteContext(request), body)),
        );
    } catch (err: unknown) {
      logError("Erro ao criar previa de atribuicao em lote", { err });
      next(err);
    }
  });

  router.get("/previews/:preview_id", async (request, response, next) => {
    try {
      const params = parseWithZod(groupAssignmentPreviewParamsSchema, request.params);
      const query = parseWithZod(groupAssignmentPreviewQuerySchema, request.query);
      response
        .status(200)
        .json(
          createSuccessResponse(
            await service.detailPreview(getPessoalRouteContext(request), params.preview_id, query),
          ),
        );
    } catch (err: unknown) {
      logError("Erro ao detalhar previa de atribuicao em lote", { err });
      next(err);
    }
  });

  router.post("/apply", async (request, response, next) => {
    try {
      const body = parseWithZod(applyGroupAssignmentPreviewBodySchema, request.body);
      const idempotencyKey = parseWithZod(
        groupAssignmentIdempotencyKeySchema,
        request.get("Idempotency-Key"),
      );
      response
        .status(200)
        .json(
          createSuccessResponse(
            await service.apply(getPessoalRouteContext(request), body, idempotencyKey),
          ),
        );
    } catch (err: unknown) {
      logError("Erro ao aplicar atribuicao em lote", { err });
      next(err);
    }
  });

  return router;
}
