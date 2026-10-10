import {
  createMarketingAiUsageControlBodySchema,
  createMarketingAiUsageControlsBatchBodySchema,
  importMarketingAiUsageControlsBodySchema,
  marketingAiUsageControlIdParamsSchema,
  marketingAiUsageControlQuerySchema,
  updateMarketingAiUsageControlBodySchema,
} from "@workspace/marketing-service/src/schemas/marketingAiUsageControl.schemas.js";
import {
  createMarketingEventBodySchema,
  marketingEventIdParamsSchema,
  updateMarketingEventBodySchema,
} from "@workspace/marketing-service/src/schemas/marketingEvent.schemas.js";
import {
  marketingEventEditionBodySchema,
  marketingEventEditionFeedbackBodySchema,
  marketingEventEditionIdParamsSchema,
  marketingEventEditionParamsSchema,
} from "@workspace/marketing-service/src/schemas/marketingEventEdition.schemas.js";
import {
  createMarketingPasswordBodySchema,
  importMarketingPasswordsBodySchema,
  marketingPasswordConfirmationSchema,
  marketingPasswordIdParamsSchema,
  updateMarketingPasswordBodySchema,
} from "@workspace/marketing-service/src/schemas/marketingPassword.schemas.js";
import { MarketingAiUsageControlService } from "@workspace/marketing-service/src/services/marketingAiUsageControlService.js";
import { MarketingDashboardService } from "@workspace/marketing-service/src/services/marketingDashboardService.js";
import { MarketingEventEditionsService } from "@workspace/marketing-service/src/services/marketingEventEditionsService.js";
import { MarketingEventsService } from "@workspace/marketing-service/src/services/marketingEventsService.js";
import { MarketingPasswordService } from "@workspace/marketing-service/src/services/marketingPasswordService.js";
import { type WorkerAuthContext, withWorkerPrisma } from "@workspace/runtime";
import { EncryptionService, parseWithZod } from "@workspace/shared";
import {
  createSuccessResponse,
  REQUEST_ID_HEADER,
  ServiceError,
  serializeError,
} from "@workspace/shared/http";
import type { Context } from "hono";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createMarketingWorkerAudit } from "./audit.js";
import { authenticateMarketingRequest, requireMarketingPermission } from "./auth.js";
import type { MarketingWorkerEnv } from "./env.js";
import { PrismaClient } from "./prisma.js";

/** Os serviços do marketing-service Node, montados como no `app.ts` dele. */
export function createMarketingServices(prisma: unknown, env: MarketingWorkerEnv) {
  const db = prisma as never;
  const audit = createMarketingWorkerAudit(env);
  return {
    dashboard: new MarketingDashboardService(db),
    controls: new MarketingAiUsageControlService(db, audit),
    events: new MarketingEventsService(db, audit),
    editions: new MarketingEventEditionsService(db, audit),
    passwords: () => {
      if (!env.MTK_ENCRYPTION_KEY) {
        throw new ServiceError(503, "Credenciais de Marketing indisponíveis no momento.");
      }
      return new MarketingPasswordService(db, new EncryptionService(env.MTK_ENCRYPTION_KEY), audit);
    },
  };
}

export type MarketingServices = ReturnType<typeof createMarketingServices>;

type MarketingWorkerOptions = {
  env?: MarketingWorkerEnv;
  services?: MarketingServices;
};
type MarketingBindings = {
  Bindings: MarketingWorkerEnv;
  Variables: { auth: WorkerAuthContext };
};
type MarketingContext = Context<MarketingBindings>;

const VIEWER = 1;
const EDITOR = 2;

async function readJson(c: MarketingContext): Promise<unknown> {
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ServiceError(400, "Dados inválidos.");
  }
}

export function createMarketingWorkerApp(options: MarketingWorkerOptions = {}) {
  const app = new Hono<MarketingBindings>();

  app.get("/health", (c) =>
    c.json(createSuccessResponse({ status: "ok", service: "marketing-service" })),
  );
  app.get("/ready", (c) =>
    c.json(createSuccessResponse({ status: "ready", service: "marketing-service" })),
  );

  app.use("/marketing/*", async (c, next) => {
    c.set("auth", await authenticateMarketingRequest(c.req.raw, options.env ?? c.env));
    await next();
  });

  /** Checa a permissão do módulo e entrega os serviços com o Prisma desta requisição. */
  const handle =
    (
      minimum: typeof VIEWER | typeof EDITOR,
      callback: (
        c: MarketingContext,
        services: MarketingServices,
        organizationId: string,
      ) => Promise<Response>,
    ) =>
    async (c: MarketingContext) => {
      const auth = c.get("auth");
      requireMarketingPermission(auth, minimum);
      if (!auth.organizationId) throw new ServiceError(400, "Contexto autenticado não informado.");
      const env = options.env ?? c.env;
      if (options.services) return callback(c, options.services, auth.organizationId);
      return withWorkerPrisma(env, PrismaClient, (client) =>
        callback(c, createMarketingServices(client, env), auth.organizationId),
      );
    };

  const ok = (c: MarketingContext, data: unknown, status: 200 | 201 = 200) =>
    c.json(createSuccessResponse(data), status);

  app.get(
    "/marketing/dashboard",
    handle(VIEWER, async (c, s, org) => ok(c, await s.dashboard.getDashboard(org))),
  );

  // Controle mensal de uso de IA.
  app.get(
    "/marketing/ai-usage-controls/users",
    handle(VIEWER, async (c, s, org) => ok(c, await s.controls.listEligibleUsers(org))),
  );
  app.post(
    "/marketing/ai-usage-controls/batch",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(createMarketingAiUsageControlsBatchBodySchema, await readJson(c));
      return ok(c, await s.controls.createForActiveUsers(org, body.competence), 201);
    }),
  );
  app.post(
    "/marketing/ai-usage-controls",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(createMarketingAiUsageControlBodySchema, await readJson(c));
      return ok(
        c,
        await s.controls.createForUser(org, body.userId, body.competence, c.get("auth").userId),
        201,
      );
    }),
  );
  app.get(
    "/marketing/ai-usage-controls/list",
    handle(VIEWER, async (c, s, org) => {
      const query = parseWithZod(marketingAiUsageControlQuerySchema, c.req.query());
      return ok(c, await s.controls.listControls(org, query.competence));
    }),
  );
  app.get(
    "/marketing/ai-usage-controls/report",
    handle(VIEWER, async (c, s, org) => {
      const query = parseWithZod(marketingAiUsageControlQuerySchema, c.req.query());
      return ok(c, await s.controls.getReport(org, query.competence));
    }),
  );
  app.post(
    "/marketing/ai-usage-controls/import",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(importMarketingAiUsageControlsBodySchema, await readJson(c));
      return ok(c, await s.controls.importLegacyRecords(org, body.records), 201);
    }),
  );
  app.get(
    "/marketing/ai-usage-controls/reconciliation",
    handle(VIEWER, async (c, s, org) => ok(c, await s.controls.listImportReconciliation(org))),
  );
  app.patch(
    "/marketing/ai-usage-controls/:id",
    handle(EDITOR, async (c, s, org) => {
      const { id } = parseWithZod(marketingAiUsageControlIdParamsSchema, c.req.param());
      const body = parseWithZod(updateMarketingAiUsageControlBodySchema, await readJson(c));
      return ok(c, await s.controls.updateAnswers(org, id, body, c.get("auth").userId));
    }),
  );

  // Credenciais.
  app.get(
    "/marketing/passwords/list",
    handle(VIEWER, async (c, s, org) => ok(c, await s.passwords().list(org))),
  );
  app.get(
    "/marketing/passwords/import/reconciliation",
    handle(EDITOR, async (c, s, org) => ok(c, await s.passwords().listImportReconciliation(org))),
  );
  app.post(
    "/marketing/passwords/import",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(importMarketingPasswordsBodySchema, await readJson(c));
      return ok(c, await s.passwords().importLegacyRecords(org, body.records), 201);
    }),
  );
  app.get(
    "/marketing/passwords/:id",
    handle(VIEWER, async (c, s, org) => {
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, c.req.param());
      return ok(c, await s.passwords().detail(org, id));
    }),
  );
  app.post(
    "/marketing/passwords",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(createMarketingPasswordBodySchema, await readJson(c));
      return ok(c, await s.passwords().create(org, body, c.get("auth").userId), 201);
    }),
  );
  app.patch(
    "/marketing/passwords/:id",
    handle(EDITOR, async (c, s, org) => {
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, c.req.param());
      const body = parseWithZod(updateMarketingPasswordBodySchema, await readJson(c));
      return ok(c, await s.passwords().update(org, id, body, c.get("auth").userId));
    }),
  );
  app.post(
    "/marketing/passwords/:id/reveal",
    handle(EDITOR, async (c, s, org) => {
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, c.req.param());
      const body = parseWithZod(marketingPasswordConfirmationSchema, await readJson(c));
      return ok(c, await s.passwords().reveal(org, id, body.confirmed, c.get("auth").userId));
    }),
  );
  app.post(
    "/marketing/passwords/:id/export",
    handle(EDITOR, async (c, s, org) => {
      const { id } = parseWithZod(marketingPasswordIdParamsSchema, c.req.param());
      const body = parseWithZod(marketingPasswordConfirmationSchema, await readJson(c));
      return ok(c, await s.passwords().export(org, id, body.confirmed, c.get("auth").userId));
    }),
  );

  // Eventos e edições.
  app.get(
    "/marketing/events/list",
    handle(VIEWER, async (c, s, org) => ok(c, await s.events.listEvents(org))),
  );
  app.post(
    "/marketing/events",
    handle(EDITOR, async (c, s, org) => {
      const body = parseWithZod(createMarketingEventBodySchema, await readJson(c));
      return ok(c, await s.events.createEvent(org, body, c.get("auth").userId), 201);
    }),
  );
  app.put(
    "/marketing/events/:id",
    handle(EDITOR, async (c, s, org) => {
      const { id } = parseWithZod(marketingEventIdParamsSchema, c.req.param());
      const body = parseWithZod(updateMarketingEventBodySchema, await readJson(c));
      const event = await s.events.updateEvent(org, id, body, c.get("auth").userId);
      if (!event) throw new ServiceError(404, "Evento não encontrado.");
      return ok(c, event);
    }),
  );
  app.get(
    "/marketing/events/:eventId/editions",
    handle(VIEWER, async (c, s, org) => {
      const { eventId } = parseWithZod(marketingEventEditionParamsSchema, c.req.param());
      return ok(c, await s.editions.listEditions(org, eventId));
    }),
  );
  app.post(
    "/marketing/events/:eventId/editions",
    handle(EDITOR, async (c, s, org) => {
      const { eventId } = parseWithZod(marketingEventEditionParamsSchema, c.req.param());
      const body = parseWithZod(marketingEventEditionBodySchema, await readJson(c));
      return ok(c, await s.editions.createEdition(org, eventId, body, c.get("auth").userId), 201);
    }),
  );
  app.put(
    "/marketing/events/:eventId/editions/:editionId",
    handle(EDITOR, async (c, s, org) => {
      const { eventId, editionId } = parseWithZod(
        marketingEventEditionIdParamsSchema,
        c.req.param(),
      );
      const body = parseWithZod(marketingEventEditionBodySchema, await readJson(c));
      const edition = await s.editions.updateEdition(
        org,
        eventId,
        editionId,
        body,
        c.get("auth").userId,
      );
      if (!edition) throw new ServiceError(404, "Edição não encontrada.");
      return ok(c, edition);
    }),
  );
  app.post(
    "/marketing/events/:eventId/editions/:editionId/feedback",
    handle(EDITOR, async (c, s, org) => {
      const { eventId, editionId } = parseWithZod(
        marketingEventEditionIdParamsSchema,
        c.req.param(),
      );
      const body = parseWithZod(marketingEventEditionFeedbackBodySchema, await readJson(c));
      return ok(
        c,
        await s.editions.createEditionFeedback(org, eventId, editionId, body, c.get("auth").userId),
        201,
      );
    }),
  );
  app.get(
    "/marketing/events/:eventId/editions/:editionId/report",
    handle(VIEWER, async (c, s, org) => {
      const { eventId, editionId } = parseWithZod(
        marketingEventEditionIdParamsSchema,
        c.req.param(),
      );
      const report = await s.editions.getEditionReport(org, eventId, editionId);
      if (!report) throw new ServiceError(404, "Edição não encontrada.");
      return ok(c, report);
    }),
  );

  app.notFound((c) =>
    c.json({ success: false, error: "Recurso não encontrado.", code: "NOT_FOUND" }, 404),
  );
  app.onError((error, c) => {
    const serialized = serializeError(error, {
      requestId: c.req.header(REQUEST_ID_HEADER),
      fallbackMessage: "Erro interno no marketing-service.",
    });
    return c.json(serialized.body, serialized.statusCode as ContentfulStatusCode);
  });

  return app;
}
