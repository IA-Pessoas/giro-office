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
import { getRhPermissionLevel, requireRhPermission } from "../middlewares/requireRhPermission.js";
import {
  approveAdjustmentBodySchema,
  approveAdjustmentsBulkBodySchema,
  createAdjustmentRequestBodySchema,
  createRetroactiveAdjustmentBodySchema,
  listAdjustmentRequestsQuerySchema,
  rejectAdjustmentBodySchema,
  uploadAdjustmentAttachmentParamsSchema,
} from "../schemas/timeClockRequest.schemas.js";
import {
  RH_POINT_ADJUSTMENT_MIME_TYPES,
  type RhPointAdjustmentAttachmentStorage,
} from "../services/rhPointAdjustmentStorage.js";
import {
  RH_MANAGEMENT_PERMISSION,
  RH_MANAGER_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  TimeClockRequestService,
} from "../services/timeClockRequestService.js";

const upload = createPhotoUploadMiddleware({
  allowedMimeTypes: [...RH_POINT_ADJUSTMENT_MIME_TYPES],
  maxSizeBytes: 5 * 1024 * 1024,
});

export function createTimeClockRequestRoutes(
  options: { attachmentStorage?: RhPointAdjustmentAttachmentStorage } = {},
): ReturnType<typeof Router> {
  const router: ReturnType<typeof Router> = Router();
  const timeClockRequestService = new TimeClockRequestService(
    undefined,
    undefined,
    options.attachmentStorage,
  );

  router.get(
    "/adjustment/requests",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const query = parseWithZod(listAdjustmentRequestsQuerySchema, {
          status: getSingleTrimmedQueryValue(req.query.status),
          user_id: getSingleTrimmedQueryValue(req.query.user_id),
        });
        const permission = getRhPermissionLevel(req);
        const result = await timeClockRequestService.list(
          organization_id,
          {
            status: query.status,
            user_id: permission >= RH_MANAGER_PERMISSION ? query.user_id : user_id,
          },
          { actor_user_id: user_id, rh_permission: permission },
        );
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao listar solicitacoes de ajuste de ponto", { err });
        next(err);
      }
    },
  );

  router.post(
    "/adjustment/request",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(createAdjustmentRequestBodySchema, req.body);
        const result = await timeClockRequestService.create({
          user_id,
          organization_id,
          point_id: body.point_id,
          date: body.date,
          clock_in: body.clock_in,
          lunch_out: body.lunch_out,
          lunch_in: body.lunch_in,
          clock_out: body.clock_out,
          justification: body.justification,
          attachment: body.attachment,
        });
        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao solicitar ajuste de ponto", { err });
        next(err);
      }
    },
  );

  router.put(
    "/adjustment/approve",
    isAuthenticated,
    requireRhPermission(RH_MANAGER_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(approveAdjustmentBodySchema, req.body);
        const result = await timeClockRequestService.approve({
          request_id: body.request_id,
          approver_user_id: user_id,
          organization_id,
          obs_approver: body.obs_approver,
          rh_permission: getRhPermissionLevel(req),
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao aprovar ajuste de ponto", { err });
        next(err);
      }
    },
  );

  router.put(
    "/adjustment/reject",
    isAuthenticated,
    requireRhPermission(RH_MANAGER_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(rejectAdjustmentBodySchema, req.body);
        const result = await timeClockRequestService.reject({
          request_id: body.request_id,
          approver_user_id: user_id,
          organization_id,
          obs_approver: body.obs_approver,
          rh_permission: getRhPermissionLevel(req),
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao rejeitar ajuste de ponto", { err });
        next(err);
      }
    },
  );

  router.put(
    "/adjustment/approve-bulk",
    isAuthenticated,
    requireRhPermission(RH_MANAGER_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(approveAdjustmentsBulkBodySchema, req.body);
        const result = await timeClockRequestService.approveBulk({
          request_ids: body.request_ids,
          approver_user_id: user_id,
          organization_id,
          obs_approver: body.obs_approver,
          rh_permission: getRhPermissionLevel(req),
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao aprovar lote de ajustes de ponto", { err });
        next(err);
      }
    },
  );

  router.post(
    "/adjustment/retroactive",
    isAuthenticated,
    requireRhPermission(RH_MANAGEMENT_PERMISSION),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const body = parseWithZod(createRetroactiveAdjustmentBodySchema, req.body);
        const result = await timeClockRequestService.createRetroactive({
          target_user_id: body.target_user_id,
          organization_id,
          date: body.date,
          clock_in: body.clock_in,
          lunch_out: body.lunch_out,
          lunch_in: body.lunch_in,
          clock_out: body.clock_out,
          justification: body.justification,
          approver_user_id: user_id,
        });
        res.status(201).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao criar entrada retroativa de ponto", { err });
        next(err);
      }
    },
  );

  router.post(
    "/adjustment/:requestId/attachment",
    isAuthenticated,
    requireRhPermission(RH_SELF_SERVICE_PERMISSION),
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { organization_id, user_id } = requireAuthenticatedRequestContext(req, {
          statusCode: 400,
        });
        const { requestId } = parseWithZod(uploadAdjustmentAttachmentParamsSchema, req.params);
        if (!req.file) {
          throw new ServiceError(400, "Comprovante e obrigatorio.");
        }
        validateUploadFileSignature(req.file);
        const result = await timeClockRequestService.uploadAttachment({
          request_id: requestId,
          organization_id,
          actor_user_id: user_id,
          rh_permission: getRhPermissionLevel(req),
          file: req.file,
        });
        res.status(200).json(createSuccessResponse(result));
      } catch (err) {
        logError("Erro ao anexar comprovante de ajuste de ponto", { err });
        next(err);
      }
    },
  );

  return router;
}

const router = createTimeClockRequestRoutes();

export default router;
