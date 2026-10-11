import {
  createSuccessResponse,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { Router, raw } from "express";
import { CONTABIL_READ_PERMISSION } from "../constants/permissions.js";
import { isAuthenticated, requireContabilWritePermission } from "../middlewares/isAuthenticated.js";
import { noahIdParamsSchema, noahUploadQuerySchema } from "../schemas/noah.schemas.js";
import { NOAH_LIMITS } from "../services/noahConversionService.js";
import type { NoahService } from "../services/noahService.js";

export type NoahRouteDeps = Pick<NoahService, "create" | "download">;

export function createNoahRoutes(service: NoahRouteDeps): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const upload = raw({ type: "application/zip", limit: NOAH_LIMITS.zipBytes });

  router.use(isAuthenticated, (req, _res, next) => {
    next(
      (req.permission ?? 0) < CONTABIL_READ_PERMISSION
        ? new ServiceError(403, "Sem acesso ao Contábil.")
        : undefined,
    );
  });
  router.post(
    "/",
    requireContabilWritePermission,
    (req, res, next) => {
      if (!req.is("application/zip")) return next(new ServiceError(415, "Envie um arquivo ZIP."));
      upload(req, res, (err) => {
        if (err) {
          return next(
            new ServiceError(err.status === 413 ? 413 : 400, "ZIP inválido ou maior que 5 MiB."),
          );
        }
        next();
      });
    },
    async (req, res, next) => {
      try {
        const { filename } = parseWithZod(noahUploadQuerySchema, req.query);
        if (!Buffer.isBuffer(req.body)) throw new ServiceError(400, "Envie um arquivo ZIP.");
        const auth = requireAuthenticatedRequestContext(req);
        const data = await service.create(req.body, filename, {
          userId: auth.user_id,
          organizationId: auth.organization_id,
          permission: auth.permission,
        });
        res.set("Cache-Control", "no-store").status(201).json(createSuccessResponse(data));
      } catch (err) {
        logError("Erro ao converter Noah", { err });
        next(err);
      }
    },
  );
  router.get("/:id/csv", async (req, res, next) => {
    try {
      const { id } = parseWithZod(noahIdParamsSchema, req.params);
      const auth = requireAuthenticatedRequestContext(req);
      const csv = await service.download(id, {
        userId: auth.user_id,
        organizationId: auth.organization_id,
        permission: auth.permission,
      });
      res.set("Cache-Control", "no-store").type("text/csv").attachment(`NOAH-${id}.csv`).send(csv);
    } catch (err) {
      logError("Erro ao baixar conversão Noah", { err });
      next(err);
    }
  });
  return router;
}
