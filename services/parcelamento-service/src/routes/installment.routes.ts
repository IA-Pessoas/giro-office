import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import type { Request, Response } from "express";
import { Router } from "express";
import type { ParcelamentoRequestContext } from "../middlewares/requestContext.js";
import {
  createInstallmentBodySchema,
  installmentIdParamsSchema,
  listInstallmentsQuerySchema,
  patchInstallmentBodySchema,
} from "../schemas/installment.schemas.js";
import type { InstallmentService } from "../services/installmentService.js";

export type InstallmentRouteDeps = {
  installmentService: Pick<InstallmentService, "list" | "create" | "getById" | "patch">;
};

export function createInstallmentRouter({
  installmentService,
}: InstallmentRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();

  function getContext(request: Request): ParcelamentoRequestContext {
    return request.parcelamentoContext ?? { requestId: "missing" };
  }

  router.get("/", async (request: Request, response: Response, next) => {
    try {
      const query = parseWithZod(listInstallmentsQuerySchema, request.query);
      const result = await installmentService.list(getContext(request), query);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao listar parcelamentos", { err });
      next(err);
    }
  });

  router.post("/", async (request: Request, response: Response, next) => {
    try {
      const body = parseWithZod(createInstallmentBodySchema, request.body);
      const result = await installmentService.create(getContext(request), body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao criar parcelamento", { err });
      next(err);
    }
  });

  router.get("/:id", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(installmentIdParamsSchema, request.params);
      const result = await installmentService.getById(getContext(request), params.id);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao detalhar parcelamento", { err });
      next(err);
    }
  });

  router.patch("/:id", async (request: Request, response: Response, next) => {
    try {
      const params = parseWithZod(installmentIdParamsSchema, request.params);
      const body = parseWithZod(patchInstallmentBodySchema, request.body);
      const result = await installmentService.patch(getContext(request), params.id, body);

      response.json(createSuccessResponse(result));
    } catch (err) {
      logError("Erro ao atualizar parcelamento", { err });
      next(err);
    }
  });

  return router;
}
