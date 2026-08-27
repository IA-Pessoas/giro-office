import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_TYPE_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
} from "@workspace/shared";
import express from "express";
import "express-async-errors";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createReportRetentionRouter } from "../routes/reportRetention.routes.js";

const organizationId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000001";

describe("reportRetention routes", () => {
  it("permite ao owner alterar a retenção que será usada por jobs futuros", async () => {
    const updateOrganizationPolicy = vi.fn().mockResolvedValue({ retention_days: 45 });
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportRetentionRouter({
        retentionService: {
          getOrganizationPolicy: vi.fn().mockResolvedValue({ retention_days: 30 }),
          updateOrganizationPolicy,
        } as never,
        auditService: { recordRetentionChangeLocal: vi.fn() } as never,
        accessContextClient: {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: organizationId },
            type: "owner",
            modules: {},
          }),
        },
      }),
    );
    app.use(
      (
        error: { statusCode?: number },
        _request: unknown,
        response: express.Response,
        _next: unknown,
      ) => {
        response.status(error.statusCode ?? 500).end();
      },
    );

    await request(app)
      .put("/reports/retention")
      .set(FORWARDED_AUTH_USER_ID_HEADER, ownerId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_TYPE_HEADER, "owner")
      .send({ retention_days: 45 })
      .expect(200);

    expect(updateOrganizationPolicy).toHaveBeenCalledWith({
      organizationId,
      retentionDays: 45,
    });
  });

  it("bloqueia a alteração de retenção para quem não é owner", async () => {
    const updateOrganizationPolicy = vi.fn();
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportRetentionRouter({
        retentionService: { updateOrganizationPolicy } as never,
        auditService: { recordRetentionChangeLocal: vi.fn() } as never,
        accessContextClient: {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: organizationId },
            type: "admin",
            modules: {},
          }),
        },
      }),
    );
    app.use(
      (
        error: { statusCode?: number },
        _request: unknown,
        response: express.Response,
        _next: unknown,
      ) => {
        response.status(error.statusCode ?? 500).end();
      },
    );

    await request(app)
      .put("/reports/retention")
      .set(FORWARDED_AUTH_USER_ID_HEADER, ownerId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .set(FORWARDED_AUTH_TYPE_HEADER, "admin")
      .send({ retention_days: 45 })
      .expect(403);

    expect(updateOrganizationPolicy).not.toHaveBeenCalled();
  });

  it("audita localmente o ator e o antes/depois da retenção", async () => {
    const getOrganizationPolicy = vi.fn().mockResolvedValue({ retention_days: 30 });
    const updateOrganizationPolicy = vi.fn().mockResolvedValue({ retention_days: 45 });
    const recordRetentionChangeLocal = vi.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    app.use(
      "/reports",
      createReportRetentionRouter({
        retentionService: { getOrganizationPolicy, updateOrganizationPolicy } as never,
        auditService: { recordRetentionChangeLocal } as never,
        accessContextClient: {
          getAccessContext: vi.fn().mockResolvedValue({
            organization: { id: organizationId },
            type: "owner",
            modules: {},
          }),
        },
      }),
    );
    app.use(
      (
        error: { statusCode?: number },
        _request: unknown,
        response: express.Response,
        _next: unknown,
      ) => {
        response.status(error.statusCode ?? 500).end();
      },
    );

    await request(app)
      .put("/reports/retention")
      .set(FORWARDED_AUTH_USER_ID_HEADER, ownerId)
      .set(FORWARDED_AUTH_ORGANIZATION_ID_HEADER, organizationId)
      .send({ retention_days: 45 })
      .expect(200);

    expect(recordRetentionChangeLocal).toHaveBeenCalledWith({
      actor_id: ownerId,
      organization_id: organizationId,
      previous_retention_days: 30,
      next_retention_days: 45,
    });
  });
});
