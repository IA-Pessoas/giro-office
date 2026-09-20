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

import {
  createReportModelSchema,
  type ReportModelDefinition,
  reportModelIdParamsSchema,
  updateReportModelSchema,
} from "../schemas/reportModel.schemas.js";
import type { ReportAuthorizationService } from "../services/reportAuthorizationService.js";
import type { ReportModelService } from "../services/reportModelService.js";
import type { ReportPreviewService } from "../services/reportPreviewService.js";

export function createReportModelRouter(options: {
  modelService: ReportModelService;
  authorizationService: ReportAuthorizationService;
  previewService: ReportPreviewService;
}): ReturnType<typeof Router> {
  const router = Router();

  const getContext = (request: Request) => {
    const userId = request.get(FORWARDED_AUTH_USER_ID_HEADER);
    const organizationId = request.get(FORWARDED_AUTH_ORGANIZATION_ID_HEADER);
    requireAuthenticatedRequestContext({
      user_id: userId,
      organization_id: organizationId,
    });
    return { userId: userId ?? "", organizationId: organizationId ?? "" };
  };

  const validateModelDefinition = async (
    context: { userId: string; organizationId: string },
    definition: ReportModelDefinition,
    requestId: string,
  ) =>
    "version" in definition
      ? (
          await options.authorizationService.validateComposition({
            ...context,
            requestId,
            definition,
          })
        ).definition
      : (
          await options.authorizationService.validateDefinition({
            ...context,
            requestId,
            definition,
          })
        ).definition;

  router.post("/models/shared", async (request, response) => {
    const context = getContext(request);
    const body = parseWithZod(createReportModelSchema, request.body);
    const authorized = await options.authorizationService.authorizeSharedModel({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-create",
      definition: body.definition,
    });

    response.status(201).json(
      createSuccessResponse(
        await options.modelService.createShared({
          organizationId: context.organizationId,
          departmentId: authorized.department_id,
          name: body.name,
          description: body.description,
          definition: authorized.definition,
        }),
      ),
    );
  });

  router.get("/models/shared/list", async (request, response) => {
    const context = getContext(request);
    const department = await options.authorizationService.getSharedDepartment({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-list",
    });
    const items = await options.modelService.listShared({
      organizationId: context.organizationId,
      departmentId: department.id,
    });
    response.json(createSuccessResponse({ items }));
  });

  router.post("/models/shared/:id/copy", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const department = await options.authorizationService.getSharedDepartment({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-copy",
    });
    const shared = await options.modelService.getShared({
      id,
      organizationId: context.organizationId,
      departmentId: department.id,
    });
    const authorized = await options.authorizationService.validateSharedDefinition({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-copy",
      definition: shared.definition,
    });
    const personal = await options.modelService.create({
      ...context,
      name: shared.name,
      description: shared.description,
      definition: authorized.definition,
    });
    response.status(201).json(createSuccessResponse(personal));
  });

  router.post("/models/shared/:id/preview", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const execution = await options.authorizationService.getSharedExecutionContext({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-preview",
    });
    const requestId = request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-preview";
    const shared = await options.modelService.getShared({
      id,
      organizationId: context.organizationId,
      departmentId: execution.department.id,
    });
    const authorized = await options.authorizationService.validateSharedDefinition({
      ...context,
      requestId,
      definition: shared.definition,
    });
    response.json(
      createSuccessResponse(
        "version" in authorized.definition
          ? await options.previewService.previewComposition(
              authorized.definition,
              { ...execution.scope, grant: authorized.grant },
              requestId,
            )
          : await options.previewService.preview(
              authorized.definition,
              { ...execution.scope, grant: authorized.grant },
              requestId,
            ),
      ),
    );
  });

  router.get("/models/shared/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const requestId = request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-get";
    const execution = await options.authorizationService.getSharedExecutionContext({
      ...context,
      requestId,
    });
    const shared = await options.modelService.getShared({
      id,
      organizationId: context.organizationId,
      departmentId: execution.department.id,
    });
    const authorized = await options.authorizationService.validateSharedDefinition({
      ...context,
      requestId,
      definition: shared.definition,
    });
    response.json(
      createSuccessResponse({
        ...shared,
        definition: authorized.definition,
        grant: authorized.grant,
      }),
    );
  });

  router.patch("/models/shared/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const body = parseWithZod(updateReportModelSchema, request.body);
    if (!body.definition) {
      throw new ServiceError(
        400,
        "A definição é obrigatória para atualizar o modelo compartilhado.",
      );
    }
    const authorized = await options.authorizationService.authorizeSharedModel({
      ...context,
      requestId: request.get(REQUEST_ID_HEADER) ?? "reports-shared-model-update",
      definition: body.definition,
    });

    response.json(
      createSuccessResponse(
        await options.modelService.updateShared({
          id,
          organizationId: context.organizationId,
          departmentId: authorized.department_id,
          name: body.name,
          description: body.description,
          definition: authorized.definition,
        }),
      ),
    );
  });

  router.post("/models", async (request, response) => {
    const context = getContext(request);
    const body = parseWithZod(createReportModelSchema, request.body);
    const definition = await validateModelDefinition(
      context,
      body.definition,
      request.get(REQUEST_ID_HEADER) ?? "reports-model-create",
    );

    response.status(201).json(
      createSuccessResponse(
        await options.modelService.create({
          ...context,
          name: body.name,
          description: body.description,
          definition,
        }),
      ),
    );
  });

  router.get("/models/list", async (request, response) => {
    const context = getContext(request);
    const models = await options.modelService.list(context);
    const items = await Promise.all(
      models.map(async (model) => {
        try {
          await validateModelDefinition(
            context,
            model.definition,
            request.get(REQUEST_ID_HEADER) ?? "reports-model-list",
          );
          return model;
        } catch (error) {
          if (error instanceof ServiceError && error.statusCode === 403) return null;
          throw error;
        }
      }),
    );

    response.json(createSuccessResponse({ items: items.filter((model) => model !== null) }));
  });

  router.get("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const model = await options.modelService.get({ ...context, id });
    const definition = await validateModelDefinition(
      context,
      model.definition,
      request.get(REQUEST_ID_HEADER) ?? "reports-model-get",
    );
    response.json(createSuccessResponse({ ...model, definition }));
  });

  router.patch("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    const body = parseWithZod(updateReportModelSchema, request.body);
    const existing = await options.modelService.get({ ...context, id });
    const definition = await validateModelDefinition(
      context,
      body.definition ?? existing.definition,
      request.get(REQUEST_ID_HEADER) ?? "reports-model-update",
    );

    response.json(
      createSuccessResponse(
        await options.modelService.update({
          ...context,
          id,
          name: body.name,
          description: body.description,
          definition,
        }),
      ),
    );
  });

  router.delete("/models/:id", async (request, response) => {
    const context = getContext(request);
    const { id } = parseWithZod(reportModelIdParamsSchema, request.params);
    await options.modelService.delete({ ...context, id });
    response.status(204).send();
  });

  return router;
}
