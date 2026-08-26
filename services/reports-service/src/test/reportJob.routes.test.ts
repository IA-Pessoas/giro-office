import {
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportJobRouter } from "../routes/reportJob.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
const jobId = "00000000-0000-4000-8000-000000000003";

describe("reportJob routes", () => {
  it("lista o histórico pessoal com paginação", async () => {
    const listHistory = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const app = express();
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: { listHistory } as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: {} as never,
      }),
    );

    await request(app)
      .get("/reports/history?cursor=2&limit=10")
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(listHistory).toHaveBeenCalledWith({
      organizationId,
      userId,
      cursor: 2,
      limit: 10,
    });
  });

  it("permite Admin 3 excluir antecipadamente com justificativa", async () => {
    const deleteJob = vi.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {} as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: { delete: deleteJob } as never,
      }),
    );

    await request(app)
      .delete(`/reports/jobs/${jobId}`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "3")
      .send({ justification: "Solicitação formal do titular." })
      .expect(204);

    expect(deleteJob).toHaveBeenCalledWith({
      organization_id: organizationId,
      actor_id: userId,
      job_id: jobId,
      justification: "Solicitação formal do titular.",
      reason: "requested",
    });
  });

  it("aceita Admin 3 modular encaminhado pelo gateway", async () => {
    const deleteJob = vi.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {} as never,
        snapshotService: {} as never,
        authorizationService: {} as never,
        lifecycleService: { delete: deleteJob } as never,
      }),
    );

    await request(app)
      .delete(`/reports/jobs/${jobId}`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_PERMISSION_HEADER, "1")
      .set(FORWARDED_AUTH_TYPE_HEADER, "admin")
      .set(FORWARDED_AUTH_MODULES_HEADER, JSON.stringify({ contabil: 3 }))
      .send({ justification: "Solicitação formal do titular." })
      .expect(204);

    expect(deleteJob).toHaveBeenCalledOnce();
  });

  it("revalida acesso atual antes de expor snapshot", async () => {
    const validateDefinition = vi.fn().mockResolvedValue({ definition: {} });
    const getVersion = vi.fn().mockResolvedValue({
      model: { created_by_user_id: userId },
      version: { definition_json: {} },
    });
    const snapshotService = { get: vi.fn().mockResolvedValue({ rows: [], nextCursor: null }) };
    const app = express();
    app.use(
      "/reports",
      createReportJobRouter({
        jobService: {
          get: vi.fn().mockResolvedValue({ id: jobId, report_model_version_id: "version-1" }),
          getVersion,
        } as never,
        snapshotService: snapshotService as never,
        authorizationService: { validateDefinition } as never,
        lifecycleService: {} as never,
      }),
    );

    await request(app)
      .get(`/reports/jobs/${jobId}/snapshot`)
      .set(FORWARDED_AUTH_USER_ID_HEADER, userId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .expect(200);

    expect(validateDefinition).toHaveBeenCalledWith(
      expect.objectContaining({ userId, organizationId, definition: {} }),
    );
    expect(getVersion).toHaveBeenCalledWith({
      organizationId,
      modelVersionId: "version-1",
      includeEphemeral: true,
    });
    expect(snapshotService.get).toHaveBeenCalledOnce();
  });
});
