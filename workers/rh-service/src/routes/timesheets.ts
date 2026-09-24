import {
  createTimeSheetBodySchema,
  listTimeSheetsQuerySchema,
  rebuildTimeSheetBodySchema,
  reopenTimeSheetBodySchema,
  signTimeSheetBodySchema,
  timeSheetIdParamsSchema,
} from "@workspace/rh-service/src/schemas/timeSheet.schemas.js";
import { parseWithZod } from "@workspace/shared";
import { createSuccessResponse, ServiceError } from "@workspace/shared/http";
import { requireRhPermission } from "../auth.js";
import { TimeSheetService } from "../services/timeSheetService.js";
import {
  canManageRh,
  jsonBody,
  RH_MANAGEMENT_PERMISSION,
  RH_SELF_SERVICE_PERMISSION,
  type RhApp,
  type RhRouteDeps,
} from "./shared.js";

const THIRD_PARTY_MESSAGE = "Permissao insuficiente para acessar folha de ponto de terceiro.";

/** Porta de `timeSheet.routes.ts` do Node (`/rh/timesheets`). */
export function registerTimeSheetRoutes(app: RhApp, deps: RhRouteDeps): void {
  app.post("/rh/timesheets", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(createTimeSheetBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).create({
        organization_id: auth.organizationId,
        user_id: body.user_id,
        start_time: body.start_time,
        end_time: body.end_time,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/timesheets/rebuild", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(rebuildTimeSheetBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).rebuild({
        organization_id: auth.organizationId,
        timesheet_id: body.id,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/timesheets/reopen", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_MANAGEMENT_PERMISSION);
    const body = parseWithZod(reopenTimeSheetBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).reopen({
        organization_id: auth.organizationId,
        timesheet_id: body.id,
        reopened_by_user_id: auth.userId,
        reason: body.reason,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.put("/rh/timesheets/sign", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const body = parseWithZod(signTimeSheetBodySchema, await jsonBody(c));
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).sign({
        organization_id: auth.organizationId,
        timesheet_id: body.id,
        signer_user_id: auth.userId,
        signature: body.signature,
      }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/timesheets", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const query = parseWithZod(listTimeSheetsQuerySchema, c.req.query());
    const userId = canManageRh(auth) ? (query.target_user_id ?? auth.userId) : auth.userId;
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).list({ organization_id: auth.organizationId, user_id: userId }),
    );
    return c.json(createSuccessResponse(result));
  });

  app.get("/rh/timesheets/:id/pdf", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const { id } = parseWithZod(timeSheetIdParamsSchema, c.req.param());
    const result = await deps.withDb(c, async (db) => {
      const service = new TimeSheetService(db);
      const detail = await service.getById({
        organization_id: auth.organizationId,
        timesheet_id: id,
      });
      if (!canManageRh(auth) && detail.user_id !== auth.userId) {
        throw new ServiceError(403, THIRD_PARTY_MESSAGE);
      }
      return service.getPdf({ organization_id: auth.organizationId, timesheet_id: id });
    });
    return c.body(result.buffer, 200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
    });
  });

  app.get("/rh/timesheets/:id", async (c) => {
    const auth = c.get("auth");
    requireRhPermission(auth, RH_SELF_SERVICE_PERMISSION);
    const { id } = parseWithZod(timeSheetIdParamsSchema, c.req.param());
    const result = await deps.withDb(c, (db) =>
      new TimeSheetService(db).getById({ organization_id: auth.organizationId, timesheet_id: id }),
    );
    if (!canManageRh(auth) && result.user_id !== auth.userId) {
      throw new ServiceError(403, THIRD_PARTY_MESSAGE);
    }
    return c.json(createSuccessResponse(result));
  });
}
