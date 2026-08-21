import { INTERNAL_SERVICE_TOKEN_HEADER, ServiceError } from "@workspace/shared";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetUserRouteMocks, userServiceMock } from "./userTestUtils.js";

const userId = "a0000000-0000-4000-8000-000000000001";
const organizationId = "b0000000-0000-4000-8000-000000000002";

describe("internal reporting routes", () => {
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("recusa token ausente ou incorreto antes de consultar o usuário", async () => {
    const app = createTestApp({ reportsInternalToken: "reports-token" });

    for (const token of [undefined, "wrong-token"]) {
      const response = await request(app)
        .post("/internal/reporting/access-context")
        .set(token ? { [INTERNAL_SERVICE_TOKEN_HEADER]: token } : {})
        .send({ userId, organizationId });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, code: "FORBIDDEN" });
    }

    expect(userServiceMock.getReportingAccessContext).not.toHaveBeenCalled();
  });

  it("valida UUIDs e não aceita chaves extras", async () => {
    const response = await request(createTestApp({ reportsInternalToken: "reports-token" }))
      .post("/internal/reporting/access-context")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "reports-token")
      .send({ userId: "invalido", organizationId, unexpected: true });

    expect(response.status).toBe(400);
    expect(userServiceMock.getReportingAccessContext).not.toHaveBeenCalled();
  });

  it("retorna o contexto autoritativo no envelope padrão", async () => {
    const context = {
      user: { id: userId, name: "Ana", login: "ana@example.com" },
      organization: { id: organizationId, name: "Acme" },
      type: "admin",
      department: { id: "c0000000-0000-4000-8000-000000000003", name: "Contabilidade" },
      departmentModule: "contabil",
      modules: { contabil: 3 },
    };
    userServiceMock.getReportingAccessContext.mockResolvedValue(context);

    const response = await request(createTestApp({ reportsInternalToken: "reports-token" }))
      .post("/internal/reporting/access-context")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "reports-token")
      .send({ userId, organizationId });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: context });
    expect(userServiceMock.getReportingAccessContext).toHaveBeenCalledWith(userId, organizationId);
  });

  it("serializa falhas do service sem expor detalhes internos", async () => {
    userServiceMock.getReportingAccessContext.mockRejectedValue(
      new ServiceError(404, "Usuario nao encontrado."),
    );

    const response = await request(createTestApp({ reportsInternalToken: "reports-token" }))
      .post("/internal/reporting/access-context")
      .set(INTERNAL_SERVICE_TOKEN_HEADER, "reports-token")
      .send({ userId, organizationId });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ success: false, error: "Usuario nao encontrado." });
  });
});
