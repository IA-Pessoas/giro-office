import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportJobRouter } from "../routes/reportJob.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000003";
const modelVersionId = "00000000-0000-4000-8000-000000000004";

function withErrors(app: express.Express): express.Express {
  app.use(
    (
      error: { statusCode?: number },
      _request: unknown,
      response: express.Response,
      _next: unknown,
    ) => response.status(error.statusCode ?? 500).end(),
  );
  return app;
}

function accessContext(overrides: Record<string, unknown> = {}) {
  return {
    organization: { id: organizationId },
    type: "admin",
    department: { id: "department-1" },
    departmentModule: "contabil",
    modules: { contabil: 3 },
    ...overrides,
  };
}

describe("reportJob routes", () => {
  it("revalida a composição salva antes de gerar pelo modelo", async () => {
    const composition = {
      version: 2 as const,
      areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
    };
    const validateComposition = vi.fn().mockResolvedValue({ definition: composition });
    const getVersion = vi.fn().mockResolvedValue({
      model: { created_by_user_id: userId, id: "model-1" },
      version: { id: modelVersionId, definition_json: composition },
    });
    const create = vi.fn().mockResolvedValue({ id: jobId, status: "queued" });
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {
          getVersion,
          getRetentionDays: vi.fn().mockResolvedValue(30),
          create,
        } as never,
        snapshotService: {} as never,
        authorizationService: { validateComposition } as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext: vi.fn() },
      }),
    );

    await request(app)
      .post("/reports/jobs")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .send({ modelVersionId })
      .expect(201);

    expect(validateComposition).toHaveBeenCalledWith({
      userId,
      organizationId,
      requestId: "reports-job-create",
      definition: composition,
    });
    expect(create).toHaveBeenCalledWith({
      userId,
      organizationId,
      modelVersionId,
      payload: { format: "json", parameterValues: {}, retentionDays: 30 },
    });
  });

  it("encaminha Idempotency-Key e o hash do comando ao criar job", async () => {
    const createFromDefinition = vi.fn().mockResolvedValue({ id: jobId, status: "queued" });
    const definition = {
      version: 2,
      areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
    };
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: { createFromDefinition } as never,
        snapshotService: {} as never,
        authorizationService: {
          validateComposition: vi.fn().mockResolvedValue({ definition }),
        } as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext: vi.fn() },
      }),
    );

    await request(app)
      .post("/reports/jobs")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set("Idempotency-Key", "job-key")
      .send({ definition })
      .expect(201);

    expect(createFromDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "job-key",
        idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      }),
    );
  });

  it("valida e enfileira uma composição sem exigir formato", async () => {
    const validateComposition = vi.fn().mockResolvedValue({
      definition: {
        version: 2,
        areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
      },
    });
    const createFromDefinition = vi.fn().mockResolvedValue({ id: jobId, status: "queued" });
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: { createFromDefinition } as never,
        snapshotService: {} as never,
        authorizationService: { validateComposition } as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext: vi.fn() },
      }),
    );

    await request(app)
      .post("/reports/jobs")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .send({
        definition: {
          version: 2,
          areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
        },
      })
      .expect(201);

    expect(validateComposition).toHaveBeenCalledWith({
      userId,
      organizationId,
      requestId: "reports-job-create",
      definition: {
        version: 2,
        areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
      },
    });
    expect(createFromDefinition).toHaveBeenCalledWith({
      userId,
      organizationId,
      definition: {
        version: 2,
        areas: [{ source: "regularize.licenses", fields: ["protocol"] }],
      },
      payload: { format: "json", parameterValues: {} },
    });
  });

  it("lista histórico pessoal e aceita filtros no contrato jobs/list", async () => {
    const listHistory = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const app = express();
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: { listHistory } as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext: vi.fn() },
      }),
    );

    await request(app)
      .get(
        "/reports/jobs/list?scope=personal&status=completed&from=2026-08-01&to=2026-08-31&model_id=00000000-0000-4000-8000-000000000004&author_id=" +
          userId +
          "&cursor=2&limit=10",
      )
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(listHistory).toHaveBeenCalledWith({
      organizationId,
      userId,
      scope: "personal",
      status: "completed",
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T00:00:00.000Z"),
      modelId: "00000000-0000-4000-8000-000000000004",
      authorId: userId,
      cursor: 2,
      limit: 10,
    });
  });

  it("exige membro atual no access-context para listar o acervo", async () => {
    const listHistory = vi.fn();
    const getAccessContext = vi
      .fn()
      .mockResolvedValue(accessContext({ department: null, departmentModule: null, modules: {} }));
    const app = withErrors(express());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: { listHistory } as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext },
      }),
    );

    await request(app)
      .get("/reports/jobs/list?scope=library")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(403);

    expect(getAccessContext).toHaveBeenCalledOnce();
    expect(listHistory).not.toHaveBeenCalled();
  });

  it("exclui snapshot pelo id com Admin 3 do departamento e justificativa válida", async () => {
    const deleteSnapshot = vi.fn().mockResolvedValue(undefined);
    const getAccessContext = vi.fn().mockResolvedValue(accessContext());
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {} as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: { deleteSnapshot } as never,
        accessContextClient: { getAccessContext },
      }),
    );

    await request(app)
      .post("/reports/snapshots/00000000-0000-4000-8000-000000000004/delete")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_TYPE_HEADER, "admin")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ contabil: 3 }))
      .send({ justification: "Solicitação formal do titular." })
      .expect(204);

    expect(deleteSnapshot).toHaveBeenCalledWith({
      snapshot_id: "00000000-0000-4000-8000-000000000004",
      organization_id: organizationId,
      actor_id: userId,
      department_id: "department-1",
      reason: "requested",
      justification: "Solicitação formal do titular.",
    });
  });

  it("recusa exclusão quando o usuário não tem Admin 3 no departamento atual", async () => {
    const deleteSnapshot = vi.fn();
    const getAccessContext = vi.fn().mockResolvedValue(accessContext({ modules: { contabil: 2 } }));
    const app = withErrors(express());
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {} as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: { deleteSnapshot } as never,
        accessContextClient: { getAccessContext },
      }),
    );

    await request(app)
      .post("/reports/snapshots/00000000-0000-4000-8000-000000000004/delete")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_TYPE_HEADER, "admin")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ contabil: 3 }))
      .send({ justification: "Solicitação formal do titular." })
      .expect(403);

    expect(deleteSnapshot).not.toHaveBeenCalled();
  });

  it("mantém acesso do autor ao snapshot pessoal sem revalidar fonte viva", async () => {
    const validateDefinition = vi.fn();
    const getAccessContext = vi.fn().mockRejectedValue(new Error("permissão revogada"));
    const snapshotService = { get: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }) };
    const app = express();
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {},
        snapshotService: snapshotService as never,
        authorizationService: { validateDefinition } as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext },
      }),
    );

    await request(app)
      .get(`/reports/jobs/${jobId}/snapshot?scope=personal`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(getAccessContext).not.toHaveBeenCalled();
    expect(validateDefinition).not.toHaveBeenCalled();
    expect(snapshotService.get).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "personal", userId, organizationId, jobId }),
    );
  });

  it("trata scope omitido como acesso pessoal do autor", async () => {
    const snapshotService = { get: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }) };
    const app = express();
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {},
        snapshotService: snapshotService as never,
        authorizationService: {} as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext: vi.fn() },
      }),
    );

    await request(app)
      .get(`/reports/jobs/${jobId}/snapshot`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(snapshotService.get).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "personal", userId, organizationId, jobId }),
    );
  });

  it("revoga abertura de snapshot do acervo para membro removido", async () => {
    const snapshotService = { get: vi.fn() };
    const getAccessContext = vi
      .fn()
      .mockResolvedValue(accessContext({ department: null, departmentModule: null, modules: {} }));
    const app = withErrors(express());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {},
        snapshotService: snapshotService as never,
        authorizationService: {} as never,
        lifecycleService: {} as never,
        accessContextClient: { getAccessContext },
      }),
    );

    await request(app)
      .get(`/reports/jobs/${jobId}/snapshot?scope=library`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(403);

    expect(snapshotService.get).not.toHaveBeenCalled();
  });
});
