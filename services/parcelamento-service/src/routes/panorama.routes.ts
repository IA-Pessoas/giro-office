import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { Request, Response } from "express";
import { Router } from "express";

import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import {
  createPanoramaBodySchema,
  generatePanoramasBodySchema,
  listPanoramasQuerySchema,
  panoramaCompetenceParamsSchema,
  panoramaIdParamsSchema,
  patchPanoramaBodySchema,
} from "../schemas/panorama.schemas.js";
import type { PanoramaService } from "../services/panoramaService.js";

export type PanoramaRouteDeps = {
  panoramaService: Pick<
    PanoramaService,
    "list" | "create" | "getById" | "patch" | "generateForCompetence"
  >;
};

function getContext(request: Request): ParcelamentoRequestContext {
  return request.parcelamentoContext ?? { requestId: "missing" };
}

export function createPanoramaRouter({
  panoramaService,
}: PanoramaRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  router.get("/", async (request: Request, response: Response, next) => {
    try {
      const query = parseWithZod(listPanoramasQuerySchema, request.query);
      const result = await panoramaService.list(getContext(request), query);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar panoramas de parcelamento", { err });
      next(err);
    }
  });

  router.post("/", async (request: Request, response: Response, next) => {
    try {
      const body = parseWithZod(createPanoramaBodySchema, request.body);
      const result = await panoramaService.create(getContext(request), body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar panorama de parcelamento", { err });
      next(err);
    }
  });

  router.get("/:id", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(panoramaIdParamsSchema, request.params);
      const result = await panoramaService.getById(getContext(request), params.id);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar panorama de parcelamento", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(panoramaIdParamsSchema, request.params);
      const body = parseWithZod(patchPanoramaBodySchema, request.body);
      const result = await panoramaService.patch(getContext(request), params.id, body);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar panorama de parcelamento", { err });
      next(err);
    }
  });

  router.post(
    "/competences/:competence/generate",
    async (request: Request, response: Response, next) => {
      try {
        const params = parseWithZod(panoramaCompetenceParamsSchema, request.params);
        parseWithZod(generatePanoramasBodySchema, request.body);
        const result = await panoramaService.generateForCompetence(
          getContext(request),
          params.competence,
        );

        response.json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao gerar panoramas de parcelamento", { err });
        next(err);
      }
    },
  );

  return router;
}
