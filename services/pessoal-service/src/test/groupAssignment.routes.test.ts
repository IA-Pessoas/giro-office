import "./envBootstrap.js";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createGroupAssignmentRoutes } from "../routes/groupAssignment.routes.js";
import { createRouteTestApp, gatewayHeaders, groupId } from "./pessoalCoreTestUtils.js";

const clientId = "20000000-0000-4000-8000-000000000001";
const previewId = "30000000-0000-4000-8000-000000000003";
const fingerprint = "a".repeat(64);

describe("group assignment routes", () => {
  it("cria previa e encaminha o contexto autenticado", async () => {
    const service = { createPreview: vi.fn(async () => ({ preview_id: previewId })) };
    const app = createRouteTestApp(
      "/pessoal/group-assignments",
      createGroupAssignmentRoutes(service as never),
    );

    const response = await request(app)
      .post("/pessoal/group-assignments/previews")
      .set(gatewayHeaders())
      .send({ group_id: groupId, client_ids: [clientId] });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ success: true, data: { preview_id: previewId } });
    expect(service.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: expect.any(String) }),
      expect.any(Object),
    );
  });

  it("rejeita aplicacao sem Idempotency-Key antes do service", async () => {
    const service = { apply: vi.fn() };
    const app = createRouteTestApp(
      "/pessoal/group-assignments",
      createGroupAssignmentRoutes(service as never),
    );

    const response = await request(app)
      .post("/pessoal/group-assignments/apply")
      .set(gatewayHeaders())
      .send({ preview_id: previewId, fingerprint });

    expect(response.status).toBe(400);
    expect(service.apply).not.toHaveBeenCalled();
  });

  it("retorna pagina elegivel e valida pagina", async () => {
    const service = {
      listEligible: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 25, hasMore: false })),
    };
    const app = createRouteTestApp(
      "/pessoal/group-assignments",
      createGroupAssignmentRoutes(service as never),
    );

    const success = await request(app)
      .get("/pessoal/group-assignments/eligible")
      .set(gatewayHeaders());
    const invalid = await request(app)
      .get("/pessoal/group-assignments/eligible?page=0")
      .set(gatewayHeaders());

    expect(success.status).toBe(200);
    expect(invalid.status).toBe(400);
  });
});
