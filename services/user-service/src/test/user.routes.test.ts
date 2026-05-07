import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createTestApp,
  gatewayAuthHeaders,
  resetUserRouteMocks,
  storageServiceMock,
  userServiceMock,
} from "./userTestUtils.js";

describe("user routes", () => {
  beforeEach(() => {
    resetUserRouteMocks();
  });

  it("GET /user retorna 401 sem autenticacao", async () => {
    const app = createTestApp();
    const res = await request(app).get("/user");
    expect(res.status).toBe(401);
  });

  it("GET /user lista usuarios", async () => {
    userServiceMock.list.mockResolvedValue([{ id: "user-1" }]);
    const app = createTestApp();

    const res = await request(app)
      .get("/user")
      .set(gatewayAuthHeaders())
      .query({ skip: 5, take: 10 });

    expect(res.status).toBe(200);
    expect(userServiceMock.list).toHaveBeenCalledWith({ skip: 5, take: 10 });
  });

  it("GET /user/:id retorna detalhe", async () => {
    userServiceMock.getById.mockResolvedValue({ id: "user-2" });
    const app = createTestApp();

    const res = await request(app).get("/user/user-2").set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(userServiceMock.getById).toHaveBeenCalledWith("user-2");
  });

  it("POST /user cria usuario", async () => {
    userServiceMock.create.mockResolvedValue({ id: "user-3" });
    const app = createTestApp();

    const res = await request(app).post("/user").set(gatewayAuthHeaders()).send({
      name: "Novo Usuario",
      login: "novo.usuario",
      password: "secret",
      department_id: "dep-1",
      permission: 1,
    });

    expect(res.status).toBe(201);
    expect(userServiceMock.create).toHaveBeenCalledWith({
      name: "Novo Usuario",
      login: "novo.usuario",
      password: "secret",
      department_id: "dep-1",
      permission: 1,
      first_owner_flag: false,
    });
  });

  it("PATCH /user/:id atualiza usuario", async () => {
    userServiceMock.update.mockResolvedValue({ id: "user-3" });
    const app = createTestApp();

    const res = await request(app).patch("/user/user-3").set(gatewayAuthHeaders()).send({
      name: "Usuario Atualizado",
    });

    expect(res.status).toBe(200);
    expect(userServiceMock.update).toHaveBeenCalledWith("user-3", {
      name: "Usuario Atualizado",
    });
  });

  it("GET /user/:id/photo retorna JSON com url quando a foto e URL publica", async () => {
    userServiceMock.getById.mockResolvedValue({
      id: "user-3",
      photo_url: "https://cdn/avatar.png",
    });
    storageServiceMock.readUserPhoto.mockReturnValue("https://cdn/avatar.png");
    const app = createTestApp();

    const res = await request(app).get("/user/user-3/photo").set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { url: "https://cdn/avatar.png" },
    });
    expect(storageServiceMock.readUserPhoto).toHaveBeenCalledWith("https://cdn/avatar.png");
  });

  it("GET /user/:id/photo retorna 404 quando photo_url nao e URL publica", async () => {
    userServiceMock.getById.mockResolvedValue({
      id: "user-3",
      photo_url: "users/user-3/photo.png",
    });
    storageServiceMock.readUserPhoto.mockReturnValue(null);
    const app = createTestApp();

    const res = await request(app).get("/user/user-3/photo").set(gatewayAuthHeaders());

    expect(res.status).toBe(404);
    expect(storageServiceMock.readUserPhoto).toHaveBeenCalledWith("users/user-3/photo.png");
  });

  it("GET /user/:id/photo retorna 404 quando nao ha foto", async () => {
    userServiceMock.getById.mockResolvedValue({ id: "user-3", photo_url: null });
    storageServiceMock.readUserPhoto.mockReturnValue(null);
    const app = createTestApp();

    const res = await request(app).get("/user/user-3/photo").set(gatewayAuthHeaders());

    expect(res.status).toBe(404);
  });

  it("POST /user/:id/photo faz upload e atualiza foto", async () => {
    storageServiceMock.uploadUserPhoto.mockResolvedValue("https://cdn/avatar.png");
    userServiceMock.update.mockResolvedValue({ id: "user-3", photo_url: "https://cdn/avatar.png" });
    const app = createTestApp();

    const res = await request(app).post("/user/user-3/photo").set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(storageServiceMock.uploadUserPhoto).toHaveBeenCalledTimes(1);
    expect(userServiceMock.update).toHaveBeenCalledWith("user-3", {
      photo_url: "https://cdn/avatar.png",
    });
  });

  it("DELETE /user/:id/photo remove foto", async () => {
    storageServiceMock.deleteUserPhoto.mockResolvedValue(undefined);
    userServiceMock.update.mockResolvedValue({ id: "user-3", photo_url: null });
    const app = createTestApp();

    const res = await request(app).delete("/user/user-3/photo").set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(storageServiceMock.deleteUserPhoto).toHaveBeenCalledWith("user-3");
    expect(userServiceMock.update).toHaveBeenCalledWith("user-3", { photo_url: null });
  });

  it("DELETE /user/:id desativa usuario", async () => {
    userServiceMock.delete.mockResolvedValue(undefined);
    const app = createTestApp();

    const res = await request(app).delete("/user/user-3").set(gatewayAuthHeaders());

    expect(res.status).toBe(200);
    expect(userServiceMock.delete).toHaveBeenCalledWith("user-3");
  });
});
