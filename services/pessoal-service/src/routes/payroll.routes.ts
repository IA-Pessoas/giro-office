import { createSuccessResponse, error as logError, parseWithZod } from "@workspace/shared";
import { Router } from "express";

import {
  createPayrollBodySchema,
  payrollClientParamsSchema,
  updatePayrollBodySchema,
} from "../schemas/payroll.schemas.js";
import type { PayrollService } from "../services/payrollService.js";
import { getPessoalOrganizationContext, getPessoalRouteContext } from "./pessoalRouteContext.js";

export function createPayrollRoutes(service: PayrollService): Router {
  const router = Router();

  router.get("/:client_id", async (request, response, next) => {
    try {
      const context = getPessoalOrganizationContext(request);
      const params = parseWithZod(payrollClientParamsSchema, request.params);
      const result = await service.detail(context, params.client_id);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao detalhar folha de pessoal", { err });
      next(err);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const body = parseWithZod(createPayrollBodySchema, request.body);
      const result = await service.create(context, body);

      response.status(201).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao criar folha de pessoal", { err });
      next(err);
    }
  });

  router.patch("/:client_id", async (request, response, next) => {
    try {
      const context = getPessoalRouteContext(request);
      const params = parseWithZod(payrollClientParamsSchema, request.params);
      const body = parseWithZod(updatePayrollBodySchema, request.body);
      const result = await service.update(context, params.client_id, body);

      response.status(200).json(createSuccessResponse(result));
    } catch (err: unknown) {
      logError("Erro ao atualizar folha de pessoal", { err });
      next(err);
    }
  });

  return router;
}
