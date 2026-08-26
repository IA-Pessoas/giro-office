import {
  createSuccessResponse,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  parseWithZod,
  REQUEST_ID_HEADER,
  requireAuthenticatedRequestContext,
  ServiceError,
} from "@workspace/shared";
import { type Request, Router } from "express";
import { z } from "zod";
import {
  deleteReportJobSchema,
  reportHistoryQuerySchema,
} from "../schemas/reportHistory.schemas.js";
import { createReportJobSchema, reportJobIdParamsSchema } from "../schemas/reportJob.schemas.js";
import type { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import type { ReportJobService } from "../services/reportJobService.js";
import type { ReportLifecycleService } from "../services/reportLifecycleService.js";
import type { ReportSnapshotService } from "../services/reportSnapshotService.js";

function hasAdmin3Access(request: Request): boolean {
  if (request.get(FORWARDED_AUTH_TYPE_HEADER) === "owner") return true;

  const permission = Number(request.get(FORWARDED_AUTH_PERMISSION_HEADER));
  if (Number.isInteger(permission) && permission >= 3) return true;

  if (request.get(FORWARDED_AUTH_TYPE_HEADER) !== "admin") return false;
  try {
    const modules = JSON.parse(request.get(FORWARDED_AUTH_MODULES_HEADER) ?? "null");
    return (
      typeof modules === "object" &&
      modules !== null &&
      Object.values(modules).some((level) => typeof level === "number" && level >= 3)
    );
  } catch {
    return false;
  }
}

const snapshotQuerySchema = z
  .object({
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export function createReportJobRouter(options: {
  jobService: ReportJobService;
  snapshotService: ReportSnapshotService;
  authorizationService: ReportAuthorizationService;
  lifecycleService: Pick<ReportLifecycleService, "delete">;
}): ReturnType<typeof Router> {
  const router = Router();
  const context = (request: Request) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({ user_id: userId, organization_id: organizationId });
    return { userId: userId ?? "", organizationId: organizationId ?? "" };
  };
  const validateVersion = async (
    actor: { userId: string; organizationId: string },
    requestId: string,
    modelVersionId: string,
    includeEphemeral = false,
  ) => {
    const version = await options.jobService.getVersion({
      organizationId: actor.organizationId,
      modelVersionId,
      ...(includeEphemeral ? { includeEphemeral: true } : {}),
    });
    if (version.model.created_by_user_id === actor.userId) {
      await options.authorizationService.validateDefinition({
        ...actor,
        requestId,
        definition: version.version.definition_json as never,
      });
      return version;
    }
    const shared = await options.authorizationService.validateSharedDefinition({
      ...actor,
      requestId,
      definition: version.version.definition_json as never,
    });
    if (version.model.department_id !== shared.department_id) {
      throw new ServiceError(403, "O modelo compartilhado não pertence ao departamento atual.");
    }
    return version;
  };

  router.post("/jobs", async (request, response) => {
    const actor = context(request);
    const body = parseWithZod(createReportJobSchema, request.body);
    const requestId = request.get(REQUEST_ID_HEADER) ?? "reports-job-create";
    const payload = {
      format: body.format,
      parameterValues: body.parameterValues ?? {},
    };
    const job = body.definition
      ? await options.jobService.createFromDefinition({
          ...actor,
          definition: (
            await options.authorizationService.validateDefinition({
              ...actor,
              requestId,
              definition: body.definition,
            })
          ).definition,
          payload,
        })
      : await (async () => {
          const version = await validateVersion(actor, requestId, body.modelVersionId ?? "");
          const retentionDays = await options.jobService.getRetentionDays({
            organizationId: actor.organizationId,
            modelId: version.model.id,
          });
          return options.jobService.create({
            ...actor,
            modelVersionId: version.version.id,
            payload: { ...payload, retentionDays },
          });
        })();
    response.status(201).json(createSuccessResponse(job));
  });

  router.get("/jobs/:id", async (request, response) => {
    const actor = context(request);
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    response.json(createSuccessResponse(await options.jobService.get({ ...actor, id })));
  });

  router.get("/history", async (request, response) => {
    const actor = context(request);
    const query = parseWithZod(reportHistoryQuerySchema, request.query);
    response.json(
      createSuccessResponse(await options.jobService.listHistory({ ...actor, ...query })),
    );
  });

  router.delete("/jobs/:id", async (request, response) => {
    const actor = context(request);
    if (!hasAdmin3Access(request)) {
      throw new ServiceError(403, "A exclusão antecipada exige Admin 3.");
    }
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    const { justification } = parseWithZod(deleteReportJobSchema, request.body);
    await options.lifecycleService.delete({
      job_id: id,
      organization_id: actor.organizationId,
      actor_id: actor.userId,
      reason: "requested",
      justification,
    });
    response.status(204).send();
  });

  router.post("/jobs/:id/cancel", async (request, response) => {
    const actor = context(request);
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    await options.jobService.cancel({ ...actor, id });
    response.status(204).send();
  });

  router.get("/jobs/:id/snapshot", async (request, response) => {
    const actor = context(request);
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    const query = parseWithZod(snapshotQuerySchema, request.query);
    const job = await options.jobService.get({ ...actor, id });
    await validateVersion(
      actor,
      request.get(REQUEST_ID_HEADER) ?? "reports-job-snapshot",
      job.report_model_version_id,
      true,
    );
    response.json(
      createSuccessResponse(await options.snapshotService.get({ ...actor, jobId: id, ...query })),
    );
  });

  return router;
}
