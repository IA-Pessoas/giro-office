import { describe, expect, it, vi } from "vitest";
import { call, TEST_ORGANIZATION_ID, testApp } from "./testing.js";

const DEPARTMENT_ID = "d0000000-0000-4000-8000-000000000001";

function db() {
  return {
    user: {
      findMany: vi.fn(async () => [
        { id: "u1", name: "Ana", status: "active", department: { name: "Fiscal" } },
      ]),
    },
  };
}

describe("GET /rh/operational-users", () => {
  it("lists active users scoped to the organization, filtered by module and department", async () => {
    const fake = db();
    const response = await call(
      testApp(fake),
      "GET",
      `/rh/operational-users?module=contabil&department_id=${DEPARTMENT_ID}`,
      { permission: 0, modules: { contabil: 1 } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: [{ id: "u1", name: "Ana", department: "Fiscal", status: "active" }],
    });
    const where = (
      fake.user.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }]
    )[0].where;
    expect(where.department).toEqual({ organization_id: TEST_ORGANIZATION_ID, id: DEPARTMENT_ID });
    expect(where.permissions).toEqual({
      some: { organization_id: TEST_ORGANIZATION_ID, contabil: { gt: 0 } },
    });
  });

  it("returns 403 without RH management or any catalog module", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/operational-users", {
      permission: 2,
      modules: { rh: 0, comercial: 3 },
    });
    expect(response.status).toBe(403);
    expect(fake.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects unknown query parameters with 400", async () => {
    const response = await call(testApp(db()), "GET", "/rh/operational-users?module=nope");
    expect(response.status).toBe(400);
  });
});
