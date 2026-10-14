import {
  createSuccessResponse,
  getSingleTrimmedQueryValue,
  error as logError,
  parseWithZod,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { createPhotoUploadMiddleware, validateUploadFileSignature } from "@workspace/shared/upload";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { isAuthenticated } from "../middlewares/isAuthenticated.js";
import {
  canManageRh,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  requireRhPermission,
} from "../middlewares/requireRhPermission.js";
import {
  decideNitroHoursBodySchema,
  listNitroHoursQuerySchema,
  nitroHoursIdParamsSchema,
  submitNitroHoursBodySchema,
} from "../schemas/nitroHours.schemas.js";
import { NitroHoursService } from "../services/nitroHoursService.js";
import {
  type NitroHoursCertificateStorage,
  RH_NITRO_HOURS_MIME_TYPES,
} from "../services/nitroHoursStorage.js";

const upload = createPhotoUploadMiddleware({
  allowedMimeTypes: [...RH_NITRO_HOURS_MIME_TYPES],
  maxSizeBytes: 5 * 1024 * 1024,
  maxFields: 2,
  maxFieldSizeBytes: 1024,
  maxParts: 3,
});

export function createNitroHoursRoutes(
  options: { certificateStorage?: NitroHoursCertificateStorage } = {},
) {
  const router: ReturnType<typeof Router> = Router();
  const service = new NitroHoursService(undefined, options.certificateStorage);

  router.post(
    "/submissions",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    upload.single("certificate"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(submitNitroHoursBodySchema, req.body);
        const file = req.file;
        if (!file) throw new ServiceError(400, "O certificado é obrigatório.");
        validateUploadFileSignature(file);
        const result = await service.submit({
          organization_id,
          user_id,
          quarter: body.quarter,
          hours: body.hours,
          file: {
            buffer: file.buffer,
            mimetype: file.mimetype as (typeof RH_NITRO_HOURS_MIME_TYPES)[number],
          },
        });
        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao enviar horas Nitro", { err });
        next(err);
      }
    },
  );

  router.get(
    "/submissions",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const query = parseWithZod(listNitroHoursQuerySchema, {
          quarter: getSingleTrimmedQueryValue(req.query.quarter),
          user_id: getSingleTrimmedQueryValue(req.query.user_id),
        });
        const result = await service.list({
          organization_id,
          user_id,
          can_manage: canManageRh(req),
          quarter: query.quarter,
          target_user_id: query.user_id,
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar horas Nitro", { err });
        next(err);
      }
    },
  );

  router.get(
    "/summary",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const query = parseWithZod(listNitroHoursQuerySchema, {
          quarter: getSingleTrimmedQueryValue(req.query.quarter),
          user_id: getSingleTrimmedQueryValue(req.query.user_id),
        });
        if (!query.quarter) throw new ServiceError(400, "quarter é obrigatório.");
        const targetUserId = canManageRh(req) ? (query.user_id ?? user_id) : user_id;
        const accepted_hours = await service.acceptedHours({
          organization_id,
          quarter: query.quarter,
          user_id: targetUserId,
        });
        res.status(200).json(
          createSuccessResponse({
            quarter: query.quarter,
            user_id: targetUserId,
            accepted_hours,
            nitro_bonus: accepted_hours >= 10 ? 1 : 0,
          }),
        );
      } catch (err) {
        logError("Erro ao consultar resumo de horas Nitro", { err });
        next(err);
      }
    },
  );

  router.get(
    "/submissions/:id/certificate",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const { id } = parseWithZod(nitroHoursIdParamsSchema, req.params);
        const result = await service.certificateUrl({
          organization_id,
          request_id: id,
          user_id,
          can_manage: canManageRh(req),
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao buscar certificado de horas Nitro", { err });
        next(err);
      }
    },
  );

  router.patch(
    "/submissions/:id/decision",
    isAuthenticated,
    requireRhPermission(RH_MANAGEMENT_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const { id } = parseWithZod(nitroHoursIdParamsSchema, req.params);
        const body = parseWithZod(decideNitroHoursBodySchema, req.body);
        const result = await service.decide({
          organization_id,
          request_id: id,
          actor_user_id: user_id,
          ...body,
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao decidir horas Nitro", { err });
        next(err);
      }
    },
  );

  return router;
}
