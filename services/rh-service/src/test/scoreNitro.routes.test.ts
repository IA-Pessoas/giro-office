import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetRhRouteMocks, scoreNitroServiceMock } from "./rhTestUtils.js";

describe("scoreNitro routes", () => {
  const itemId = "00000000-0000-4000-8000-000000000010";

  beforeEach(() => {
    resetRhRouteMocks();
  });

  it("PUT /rh/score/nitro/update atualiza metrica", async () => {
    const app = createTestApp();
    const res = await request(app).put("/rh/score/nitro/update").send({
      score_id: itemId,
      type: "hours",
      value: 12,
    });

    expect(res.status).toBe(200);
    expect(scoreNitroServiceMock.updateMetric).toHaveBeenCalledTimes(1);
  });
});
