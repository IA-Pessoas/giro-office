import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { Router, raw } from "express";
import { isAuthenticated, requireContabilWritePermission } from "../middlewares/isAuthenticated.js";
import {
  contingencyIdParamsSchema,
  contingencyQuerySchema,
  contingencyReviewSchema,
} from "../schemas/contingency.schemas.js";
import { CONTINGENCY_LIMITS } from "../services/contingencyCalculationService.js";
import type { ContingencyService } from "../services/contingencyService.js";

export function createContingencyRoutes(
  service: Pick<ContingencyService, "simulate" | "review" | "export">,
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
  router.post(
    "/:id/review",
    isAuthenticated,
    requireContabilWritePermission,
    async (req, res, next) => {
      try {
        const { id } = parseWithZod(contingencyIdParamsSchema, req.params);
        const { content_hash } = parseWithZod(contingencyReviewSchema, req.body);
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.review(id, content_hash, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.set("Cache-Control", "no-store").json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao confirmar revisão da contingência", { err });
        next(err);
      }
    },
  );
  router.get(
    "/:id/export",
    isAuthenticated,
    requireContabilWritePermission,
    async (req, res, next) => {
      try {
        const { id } = parseWithZod(contingencyIdParamsSchema, req.params);
        const { content_hash } = parseWithZod(contingencyReviewSchema, req.query);
        const auth = requireAuthenticatedRequestContext(req);
        const html = await service.export(id, content_hash, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res
          .set({
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="contingencia-${id}.html"`,
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            "X-Content-Type-Options": "nosniff",
          })
          .type("html")
          .send(html);
      } catch (err) {
        logError("Erro ao exportar contingência revisada", { err });
        next(err);
      }
    },
  );
  return router;
}
