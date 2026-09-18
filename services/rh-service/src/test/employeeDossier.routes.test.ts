import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, employeeDossierServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

const userId = "00000000-0000-4000-8000-000000000001";
const otherUserId = "00000000-0000-4000-8000-000000000003";

describe("employee dossier routes", () => {
  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("GET /rh/profile/colaborator devolve envelope", async () => {
    employeeDossierServiceMock.getDossier.mockResolvedValueOnce({ id: userId, full_name: "Ana" });

    const response = await request(createTestApp()).get("/rh/profile/colaborator");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { id: userId, full_name: "Ana" } });
    expect(employeeDossierServiceMock.getDossier).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        targetUserId: userId,
        organizationId: "00000000-0000-4000-8000-000000000002",
        rhPermission: 3,
      }),
    );
  });

  it("GET /rh/profile/colaborator/list lista projeções", async () => {
    employeeDossierServiceMock.listDossiers.mockResolvedValueOnce([
      { id: userId, full_name: "Ana" },
    ]);

    const response = await request(createTestApp({ rhPermission: 2 })).get(
      "/rh/profile/colaborator/list",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: userId, full_name: "Ana" }]);
    expect(employeeDossierServiceMock.listDossiers).toHaveBeenCalledWith(
      expect.objectContaining({ rhPermission: 2 }),
    );
  });

  it("PUT /rh/profile/colaborator envia atualização sem escopo externo", async () => {
    const response = await request(createTestApp()).put("/rh/profile/colaborator").send({
      address: "Rua B",
      email: "ana.nova@example.com",
      organization_id: "org-forjada",
    });

    expect(response.status).toBe(400);
    expect(employeeDossierServiceMock.updateDossier).not.toHaveBeenCalled();

    const validResponse = await request(createTestApp()).put("/rh/profile/colaborator").send({
      address: "Rua B",
      email: "ana.nova@example.com",
    });

    expect(validResponse.status).toBe(200);
    expect(employeeDossierServiceMock.updateDossier).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: userId,
        targetUserId: userId,
        changes: { address: "Rua B", email: "ana.nova@example.com" },
      }),
    );
  });

  it("contact e allergy expõem CRUD protegido pelo mesmo contexto", async () => {
    const app = createTestApp();

    expect((await request(app).get("/rh/profile/contact")).status).toBe(200);
    expect(
      (
        await request(app)
          .post("/rh/profile/contact")
          .send({ name: "Carlos", phone: "5511888888888" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .put("/rh/profile/contact")
          .send({ id: "00000000-0000-4000-8000-000000000010", phone: "5511777777777" })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete("/rh/profile/contact")
          .send({ id: "00000000-0000-4000-8000-000000000010" })
      ).status,
    ).toBe(200);
    expect((await request(app).get("/rh/profile/allergy")).status).toBe(200);
    expect(
      (
        await request(app)
          .put("/rh/profile/allergy")
          .send({ allergies: [{ name: "poeira", fonts: "ambiental", action: "evitar" }] })
      ).status,
    ).toBe(200);

    expect(employeeDossierServiceMock.listContacts).toHaveBeenCalledTimes(1);
    expect(employeeDossierServiceMock.createContact).toHaveBeenCalledTimes(1);
    expect(employeeDossierServiceMock.updateContact).toHaveBeenCalledTimes(1);
    expect(employeeDossierServiceMock.deleteContact).toHaveBeenCalledTimes(1);
    expect(employeeDossierServiceMock.listAllergies).toHaveBeenCalledTimes(1);
    expect(employeeDossierServiceMock.replaceAllergies).toHaveBeenCalledTimes(1);
  });

  it("rejeita acesso sem permissão RH", async () => {
    const response = await request(createTestApp({ rhPermission: 0 })).get(
      "/rh/profile/colaborator",
    );

    expect(response.status).toBe(403);
    expect(employeeDossierServiceMock.getDossier).not.toHaveBeenCalled();
  });

  it("rejeita target_user_id inválido pelo contrato", async () => {
    const response = await request(createTestApp()).put("/rh/profile/contact").send({
      id: otherUserId,
      target_user_id: "not-a-uuid",
      phone: "5511777777777",
    });

    expect(response.status).toBe(400);
    expect(employeeDossierServiceMock.updateContact).not.toHaveBeenCalled();
  });
});
