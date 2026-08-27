import {
  createSuccessResponse,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
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
  reportJobListQuerySchema,
} from "../schemas/reportHistory.schemas.js";
import { createReportJobSchema, reportJobIdParamsSchema } from "../schemas/reportJob.schemas.js";
import type { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import type { ReportJobService } from "../services/reportJobService.js";
import type { ReportLifecycleService } from "../services/reportLifecycleService.js";
import type { ReportSnapshotService } from "../services/reportSnapshotService.js";
import {
  getReportingAccessContext,
  type ReportingAccessContextClient,
} from "./reportingContext.js";

const snapshotQuerySchema = z
  .object({
    scope: z.enum(["personal", "library"]).default("personal"),
    cursor: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export function createReportJobRouter(options: {
  jobService: ReportJobService;
  snapshotService: ReportSnapshotService;
  authorizationService: ReportAuthorizationService;
  lifecycleService: Pick<ReportLifecycleService, "deleteSnapshot">;
  accessContextClient: ReportingAccessContextClient;
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

  router.get("/jobs/list", async (request, response) => {
    const actor = context(request);
    const query = parseWithZod(reportJobListQuerySchema, request.query);
    const access =
      query.scope === "library"
        ? await getReportingAccessContext(options.accessContextClient, {
            ...actor,
            requestId: request.get(REQUEST_ID_HEADER) ?? "reports-job-list",
          })
        : null;
    if (query.scope === "library" && !access?.department) {
      throw new ServiceError(403, "O acervo compartilhado exige membro de departamento.");
    }
    response.json(
      createSuccessResponse(
        await options.jobService.listHistory({
          ...actor,
          scope: query.scope,
          ...(access?.department ? { departmentId: access.department.id } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.from ? { from: query.from } : {}),
          ...(query.to ? { to: query.to } : {}),
          ...(query.model_id ? { modelId: query.model_id } : {}),
          ...(query.author_id ? { authorId: query.author_id } : {}),
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          limit: query.limit,
        }),
      ),
    );
  });

  router.get("/jobs/:id", async (request, response) => {
    const actor = context(request);
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    response.json(createSuccessResponse(await options.jobService.get({ ...actor, id })));
  });

  router.post("/snapshots/:id/delete", async (request, response) => {
    const actor = context(request);
    const access = await getReportingAccessContext(options.accessContextClient, {
      ...actor,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-snapshot-delete",
    });
    const department = access.department;
    const module = access.departmentModule;
    if (access.type !== "admin" || !department || !module || (access.modules[module] ?? 0) < 3) {
      throw new ServiceError(403, "A exclusão exige Admin 3 do departamento do job.");
    }
    const { id } = parseWithZod(reportJobIdParamsSchema, request.params);
    const { justification } = parseWithZod(deleteReportJobSchema, request.body);
    await options.lifecycleService.deleteSnapshot({
      snapshot_id: id,
      organization_id: actor.organizationId,
      actor_id: actor.userId,
      department_id: department.id,
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
    const access =
      query.scope === "library"
        ? await getReportingAccessContext(options.accessContextClient, {
            ...actor,
            requestId: request.get(REQUEST_ID_HEADER) ?? "reports-job-snapshot",
          })
        : null;
    if (query.scope === "library" && !access?.department) {
      throw new ServiceError(403, "O acervo compartilhado exige membro de departamento.");
    }
    response.json(
      createSuccessResponse(
        await options.snapshotService.get({
          ...actor,
          jobId: id,
          scope: query.scope,
          ...(access?.department ? { departmentId: access.department.id } : {}),
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          limit: query.limit,
        }),
      ),
    );
  });

  return router;
}
