import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { Router, raw } from "express";
import { isAuthenticated, requireContabilWritePermission } from "../middlewares/isAuthenticated.js";
import { contingencyQuerySchema } from "../schemas/contingency.schemas.js";
import { CONTINGENCY_LIMITS } from "../services/contingencyCalculationService.js";
import type { ContingencyService } from "../services/contingencyService.js";

export function createContingencyRoutes(
  service: Pick<ContingencyService, "simulate">,
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const upload = raw({ type: "application/vnd.ms-excel", limit: CONTINGENCY_LIMITS.bytes });
  router.post(
    "/",
    isAuthenticated,
    requireContabilWritePermission,
    (req, res, next) => {
      if (!req.is("application/vnd.ms-excel"))
        return next(new ServiceError(415, "Envie um arquivo XLS."));
      upload(req, res, (err) => {
        next(
          err
            ? new ServiceError(err.status === 413 ? 413 : 400, "XLS inválido ou maior que 5 MiB.")
            : undefined,
        );
      });
    },
    async (req, res, next) => {
      try {
        const input = parseWithZod(contingencyQuerySchema, req.query);
        if (!Buffer.isBuffer(req.body)) throw new ServiceError(400, "Envie um arquivo XLS.");
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.simulate(req.body, input, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.set("Cache-Control", "no-store").json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao simular contingência contábil", { err });
        next(err);
      }
    },
  );
  return router;
}
