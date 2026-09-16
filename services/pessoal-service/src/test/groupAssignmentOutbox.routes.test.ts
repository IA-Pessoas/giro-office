import "./envBootstrap.js";

import { INTERNAL_SERVICE_TOKEN_HEADER } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createGroupAssignmentOutboxRoutes } from "../routes/groupAssignmentOutbox.routes.js";
import { createRouteTestApp } from "./pessoalCoreTestUtils.js";

describe("group assignment outbox internal routes", () => {
  it("rejeita token interno ausente ou invalido", async () => {
    const service = { reconcilePendingAuditEvents: vi.fn() };
    const app = createRouteTestApp(
      "/internal/pessoal/group-assignments/audit-outbox",
      createGroupAssignmentOutboxRoutes({
        internalServiceToken: "internal-token",
        service: service as never,
      }),
    );

    await expect(
      request(app).post("/internal/pessoal/group-assignments/audit-outbox/reconcile"),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      request(app)
        .post("/internal/pessoal/group-assignments/audit-outbox/reconcile")
        .set(INTERNAL_SERVICE_TOKEN_HEADER, "wrong-token"),
    ).resolves.toMatchObject({ status: 403 });
    expect(service.reconcilePendingAuditEvents).not.toHaveBeenCalled();
  });

  it("reconcilia a outbox com token interno", async () => {
    const result = { processed: 1, pending: 0 };
    const service = { reconcilePendingAuditEvents: vi.fn(async () => result) };
    const app = createRouteTestApp(
      "/internal/pessoal/group-assignments/audit-outbox",
      createGroupAssignmentOutboxRoutes({
        internalServiceToken: "internal-token",
        service: service as never,
      }),
    );

    const response = await request(app)
      .post("/internal/pessoal/group-assignments/audit-outbox/reconcile")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "internal-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: result });
    expect(service.reconcilePendingAuditEvents).toHaveBeenCalledOnce();
  });
});
