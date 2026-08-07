import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { Request, Response } from "express";
import { Router } from "express";

import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import {
  createInstallmentCompetencyBodySchema,
  installmentCompetencyIdParamsSchema,
  installmentCompetencyParentParamsSchema,
  listInstallmentCompetenciesQuerySchema,
  patchInstallmentCompetencyBodySchema,
} from "../schemas/installmentCompetency.schemas.js";
import type { InstallmentCompetencyService } from "../services/installmentCompetencyService.js";

export type InstallmentCompetencyCollectionRouteDeps = {
  competencyService: Pick<InstallmentCompetencyService, "list" | "create">;
};

export type InstallmentCompetencyItemRouteDeps = {
  competencyService: Pick<InstallmentCompetencyService, "patch">;
};

function getContext(request: Request): ParcelamentoRequestContext {
  return request.parcelamentoContext ?? { requestId: "missing" };
}

export function createInstallmentCompetencyCollectionRouter({
  competencyService,
}: InstallmentCompetencyCollectionRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/:installmentId/competencies", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(installmentCompetencyParentParamsSchema, request.params);
      const query = parseWithZod(listInstallmentCompetenciesQuerySchema, request.query);
      const result = await competencyService.list(getContext(request), params.installmentId, query);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar competencias de parcelamento", { err });
      next(err);
    }
  });

  router.post(
    "/:installmentId/competencies",
    async (request: Request, response: Response, next) => {
      try {
        const params = parseWithZod(installmentCompetencyParentParamsSchema, request.params);
        const body = parseWithZod(createInstallmentCompetencyBodySchema, request.body);
        const result = await competencyService.create(
          getContext(request),
          params.installmentId,
          body,
        );

        response.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar competencia de parcelamento", { err });
        next(err);
      }
    },
  );

  return router;
}

export function createInstallmentCompetencyItemRouter({
  competencyService,
}: InstallmentCompetencyItemRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.patch("/:id", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(installmentCompetencyIdParamsSchema, request.params);
      const body = parseWithZod(patchInstallmentCompetencyBodySchema, request.body);
      const result = await competencyService.patch(getContext(request), params.id, body);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar competencia de parcelamento", { err });
      next(err);
    }
  });

  return router;
}
