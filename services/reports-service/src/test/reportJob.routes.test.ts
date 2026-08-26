import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
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
