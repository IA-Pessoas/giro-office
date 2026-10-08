import {
  listPointsQuerySchema,
  pointIdParamsSchema,
  pointSummaryQuerySchema,
  recalculatePointsBodySchema,
} from "@workspace/rh-service/src/schemas/point.schemas.js";
import {
  approveAdjustmentBodySchema,
  approveAdjustmentsBulkBodySchema,
  createAdjustmentRequestBodySchema,
  createRetroactiveAdjustmentBodySchema,
  listAdjustmentRequestsQuerySchema,
  rejectAdjustmentBodySchema,
  uploadAdjustmentAttachmentParamsSchema,
} from "@workspace/rh-service/src/schemas/timeClockRequest.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, ServiceError } from "@workspace/shared/http";
import { validateUploadFileSignature } from "@workspace/shared/upload";
import { requireRhPermission } from "../auth.js";
import { PointService, parsePointMinIntervalMinutes } from "../services/pointService.js";
import {
  RH_POINT_ADJUSTMENT_MIME_TYPES,
  rhPointAdjustmentStorageFromEnv,
} from "../services/rhPointAdjustmentStorage.js";
import {
  RH_MANAGER_PERMISSION,
  TimeClockRequestService,
} from "../services/timeClockRequestService.js";
import {
  canManageRh,
  jsonBody,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  type RhApp,
  type RhContext,
  type RhDb,
  type RhRouteDeps,
  rhPermissionLevel,
  trimmedQuery,
  uploadedFile,
} from "./shared.js";

/** `/rh/point` do Node: `point.routes.ts` + `timeClockRequest.routes.ts`. */
export function registerPointRoutes(app: RhApp, deps: RhRouteDeps): void {
  const pointService = (c: RhContext, db: RhDb) =>
    new PointService(db, parsePointMinIntervalMinutes(deps.env(c).POINT_MIN_INTERVAL_MINUTES));
  const requestService = (c: RhContext, db: RhDb) =>
    new TimeClockRequestService(
      db,
      pointService(c, db),
      rhPointAdjustmentStorageFromEnv(deps.env(c)),
    );

  app.get("/rh/point", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listPointsQuerySchema, {
      date_from: trimmedQuery(c, "date_from"),
      date_to: trimmedQuery(c, "date_to"),
      user_id: trimmedQuery(c, "user_id"),
    });
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).listPoints(auth.organizationId, {
        user_id: canManageRh(auth) ? query.user_id : auth.userId,
        date_from: query.date_from,
        date_to: query.date_to,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/point/me/today", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).getTodayPointForUser({
        organization_id: auth.organizationId,
        user_id: auth.userId,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/point/summary", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(pointSummaryQuerySchema, {
      month: trimmedQuery(c, "month"),
      user_id: trimmedQuery(c, "user_id"),
    });
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).getMonthlySummary({
        organization_id: auth.organizationId,
        user_id: canManageRh(auth) ? (query.user_id ?? auth.userId) : auth.userId,
        month: query.month,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/point/register", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).registerPoint({
        user_id: auth.userId,
        organization_id: auth.organizationId,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/point/recalculate", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(recalculatePointsBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).recalculateRange({
        organization_id: auth.organizationId,
        user_id: body.target_user_id,
        date_from: body.date_from,
        date_to: body.date_to,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/point/:pointId/calculate", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const { pointId } = parseWithZod(pointIdParamsSchema, c.req.param());
    const result = await deps.withDb(c, (db) =>
      pointService(c, db).calculateDailyHours(pointId, auth.organizationId, db),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/point/adjustment/requests", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listAdjustmentRequestsQuerySchema, {
      status: trimmedQuery(c, "status"),
      user_id: trimmedQuery(c, "user_id"),
    });
    const permission = rhPermissionLevel(auth);
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).list(
        auth.organizationId,
        {
          status: query.status,
          user_id: permission >= RH_MANAGER_PERMISSION ? query.user_id : auth.userId,
        },
        { actor_user_id: auth.userId, rh_permission: permission },
      ),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/point/adjustment/request", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const body = parseWithZod(createAdjustmentRequestBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).create({
        user_id: auth.userId,
        organization_id: auth.organizationId,
        point_id: body.point_id,
        date: body.date,
        clock_in: body.clock_in,
        lunch_out: body.lunch_out,
        lunch_in: body.lunch_in,
        clock_out: body.clock_out,
        justification: body.justification,
        attachment: body.attachment,
      }),
    );
    return c.json(createSuccessResponse(result), 201);
  });

  app.put("/rh/point/adjustment/approve", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGER_PERMISSION);
    const body = parseWithZod(approveAdjustmentBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).approve({
        request_id: body.request_id,
        approver_user_id: auth.userId,
        organization_id: auth.organizationId,
        obs_approver: body.obs_approver,
        rh_permission: rhPermissionLevel(auth),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/point/adjustment/reject", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGER_PERMISSION);
    const body = parseWithZod(rejectAdjustmentBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).reject({
        request_id: body.request_id,
        approver_user_id: auth.userId,
        organization_id: auth.organizationId,
        obs_approver: body.obs_approver,
        rh_permission: rhPermissionLevel(auth),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/point/adjustment/approve-bulk", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGER_PERMISSION);
    const body = parseWithZod(approveAdjustmentsBulkBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).approveBulk({
        request_ids: body.request_ids,
        approver_user_id: auth.userId,
        organization_id: auth.organizationId,
        obs_approver: body.obs_approver,
        rh_permission: rhPermissionLevel(auth),
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.post("/rh/point/adjustment/retroactive", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(createRetroactiveAdjustmentBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).createRetroactive({
        target_user_id: body.target_user_id,
        organization_id: auth.organizationId,
        date: body.date,
        clock_in: body.clock_in,
        lunch_out: body.lunch_out,
        lunch_in: body.lunch_in,
        clock_out: body.clock_out,
        justification: body.justification,
        approver_user_id: auth.userId,
      }),
    );
    return c.json(createSuccessResponse(result), 201);
  });

  app.post("/rh/point/adjustment/:requestId/attachment", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const file = await uploadedFile(c, "file", {
      allowedMimeTypes: RH_POINT_ADJUSTMENT_MIME_TYPES,
      maxSizeBytes: 5 * 1024 * 1024,
    });
    const { requestId } = parseWithZod(uploadAdjustmentAttachmentParamsSchema, c.req.param());
    if (!file) {
      throw new ServiceError(400, "Comprovante é obrigatório.");
    }
    validateUploadFileSignature(file);
    const result = await deps.withDb(c, (db) =>
      requestService(c, db).uploadAttachment({
        request_id: requestId,
        organization_id: auth.organizationId,
        actor_user_id: auth.userId,
        rh_permission: rhPermissionLevel(auth),
        file,
      }),
    );
    return c.json(createSuccessResponse(result));
  });
}
