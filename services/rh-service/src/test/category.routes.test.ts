import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { categoryServiceMock, createTestApp, resetRhRouteMocks } from "./rhTestUtils.js";

describe("category routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/categories cria categoria", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/categories").send({ name: "Categoria" });

    expect(res.status).toBe(200);
    expect(categoryServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/categories atualiza categoria", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/categories").send({ id: itemId, name: "Categoria 2" });

    expect(res.status).toBe(200);
    expect(categoryServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/categories lista categorias", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/categories").query({ activeOnly: "true" });

    expect(res.status).toBe(200);
    expect(categoryServiceMock.list).toHaveBeenCalledWith(organizationId, { activeOnly: true });
  });

  it("GET /rh/categories permite leitura com permissao RH pessoal", async () => {
    const app = createTestApp();
    const res = await request(app)
      .get("/rh/categories")
      .set("x-auth-permission", "1")
      .query({ activeOnly: "true" });

    expect(res.status).toBe(200);
    expect(categoryServiceMock.list).toHaveBeenCalledWith(organizationId, { activeOnly: true });
  });

  it("POST /rh/categories bloqueia escrita com permissao RH pessoal", async () => {
    const app = createTestApp();
    const res = await request(app)
      .post("/rh/categories")
      .set("x-auth-permission", "1")
      .send({ name: "Categoria" });

    expect(res.status).toBe(403);
    expect(categoryServiceMock.create).not.toHaveBeenCalled();
  });

  it("DELETE /rh/categories remove categoria", async () => {
    const app = createTestApp();
    const res = await request(app).delete("/rh/categories").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(categoryServiceMock.delete).toHaveBeenCalledTimes(1);
  });
});
