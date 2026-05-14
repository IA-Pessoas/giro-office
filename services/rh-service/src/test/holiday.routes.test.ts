import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, holidayServiceMock, resetRhRouteMocks } from "./rhTestUtils.js";

describe("holiday routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";
  const organizationId = "00000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("POST /rh/holidays cria feriado", async () => {
    const app = createTestApp();
    const res = await request(app).post("/rh/holidays").send({
      name: "Natal",
      date: "2025-12-25",
    });

    expect(res.status).toBe(200);
    expect(holidayServiceMock.create).toHaveBeenCalledTimes(1);
  });

  it("PUT /rh/holidays atualiza feriado", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/holidays").send({
      id: itemId,
      name: "Natal Atualizado",
      date: "2025-12-25",
    });

    expect(res.status).toBe(200);
    expect(holidayServiceMock.update).toHaveBeenCalledTimes(1);
  });

  it("GET /rh/holidays lista feriados", async () => {
    const app = createTestApp();
    const res = await request(app).get("/rh/holidays");

    expect(res.status).toBe(200);
    expect(holidayServiceMock.list).toHaveBeenCalledWith(organizationId);
  });

  it("DELETE /rh/holidays remove feriado", async () => {
    const app = createTestApp();
    const res = await request(app).delete("/rh/holidays").send({ id: itemId });

    expect(res.status).toBe(200);
    expect(holidayServiceMock.delete).toHaveBeenCalledTimes(1);
  });
});
