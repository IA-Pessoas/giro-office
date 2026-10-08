import { describe, expect, it, vi } from "vitest";
import { parsePointMinIntervalMinutes } from "../services/pointService.js";
import {
  SupabaseRhPointAdjustmentStorage,
  UnavailableRhPointAdjustmentStorage,
} from "../services/rhPointAdjustmentStorage.js";
import { call, TEST_ORGANIZATION_ID, TEST_USER_ID, testApp } from "./testing.js";

const POINT_ID = "e0000000-0000-4000-8000-000000000001";
const REQUEST_ID = "f0000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "b0000000-0000-4000-8000-000000000002";
const FILE_ID = "a1b2c3d4-0000-4000-8000-000000000001";

const DAY = "2026-09-01";
const times = {
  clock_in: `${DAY}T08:00:00.000Z`,
  lunch_out: `${DAY}T12:00:00.000Z`,
  lunch_in: `${DAY}T13:00:00.000Z`,
  clock_out: `${DAY}T17:00:00.000Z`,
};

function point(overrides: Record<string, unknown> = {}) {
  return {
    id: POINT_ID,
    user_id: TEST_USER_ID,
    organization_id: TEST_ORGANIZATION_ID,
    clock_in: new Date(times.clock_in),
    lunch_out: new Date(times.lunch_out),
    lunch_in: new Date(times.lunch_in),
    clock_out: new Date(times.clock_out),
    workload_hours: 480,
    time_bank_balance: 0,
    signature: null,
    ...overrides,
  };
}

function adjustment(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    user_id: OTHER_USER_ID,
    point_id: null,
    ...Object.fromEntries(Object.entries(times).map(([k, v]) => [k, new Date(v)])),
    justification: "Esqueci",
    attachment: null,
    date: new Date(`${DAY}T00:00:00.000Z`),
    status: "Pendente",
    approver_user_id: null,
    obs_approver: null,
    organization_id: TEST_ORGANIZATION_ID,
    ...overrides,
  };
}

const config = {
  user_id: TEST_USER_ID,
  organization_id: TEST_ORGANIZATION_ID,
  start_time: new Date("1970-01-01T08:00:00.000Z"),
  lunch_break: new Date("1970-01-01T12:00:00.000Z"),
  lunch_return: new Date("1970-01-01T13:00:00.000Z"),
  end_time: new Date("1970-01-01T17:00:00.000Z"),
  work_days: "1,2,3,4,5",
};

function db() {
  const fake = {
    $queryRaw: vi.fn(async () => [{ timezone: "UTC" }]),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(fake)),
    point: {
      findFirst: vi.fn(async () => null as unknown),
      findMany: vi.fn(async () => [point()]),
      findUnique: vi.fn(async () => point() as unknown),
      findUniqueOrThrow: vi.fn(async () => point()),
      create: vi.fn(async () => point({ lunch_out: null, lunch_in: null, clock_out: null })),
      update: vi.fn(async () => point()),
    },
    pointsConfig: {
      findUnique: vi.fn(async () => config as unknown),
      update: vi.fn(async () => ({})),
    },
    holidays: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
    timeSheets: { findFirst: vi.fn(async () => null as unknown) },
    timeClockRequest: {
      count: vi.fn(async () => 2),
      findFirst: vi.fn(async () => null as unknown),
      findMany: vi.fn(async () => [adjustment()]),
      findUnique: vi.fn(async () => adjustment() as unknown),
      findUniqueOrThrow: vi.fn(async () => adjustment({ status: "Aprovado" })),
      create: vi.fn(async () => adjustment({ user_id: TEST_USER_ID })),
      update: vi.fn(async () => adjustment()),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: {
      findFirst: vi.fn(async () => ({ id: TEST_USER_ID, department_id: "dep" }) as unknown),
    },
  };
  return fake;
}

async function json(response: Response) {
  return (await response.json()) as { success: boolean; data: unknown; error?: string };
}

describe("rh Worker /rh/point", () => {
  it("parses POINT_MIN_INTERVAL_MINUTES like the Node env", () => {
    expect(parsePointMinIntervalMinutes(undefined)).toBe(30);
    expect(parsePointMinIntervalMinutes("15")).toBe(15);
    expect(parsePointMinIntervalMinutes("-1")).toBe(0);
    expect(parsePointMinIntervalMinutes("abc")).toBe(0);
  });

  it("GET /rh/point lists own points for self-service and forces the actor user_id", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", `/rh/point?user_id=${OTHER_USER_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(((await json(response)).data as Array<{ status: string }>)[0]?.status).toBe("Completo");
    const args = fake.point.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(args[0].where).toMatchObject({
      organization_id: TEST_ORGANIZATION_ID,
      user_id: TEST_USER_ID,
    });
  });

  it("GET /rh/point rejects invalid dates and missing RH permission", async () => {
    const app = testApp(db());
    expect((await call(app, "GET", "/rh/point?date_from=nope")).status).toBe(400);
    expect((await call(app, "GET", "/rh/point", { permission: 0 })).status).toBe(403);
  });

  it("GET /rh/point/me/today returns the next action", async () => {
    const response = await call(testApp(db()), "GET", "/rh/point/me/today", { permission: 1 });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({ point: null, next_action: "Entrada" });
    expect((await call(testApp(db()), "GET", "/rh/point/me/today", { permission: 0 })).status).toBe(
      403,
    );
  });

  it("GET /rh/point/summary computes the month and validates month", async () => {
    const response = await call(testApp(db()), "GET", "/rh/point/summary?month=2026-09");
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({
      month: "2026-09",
      user_id: TEST_USER_ID,
      pending_adjustments: 2,
    });
    expect((await call(testApp(db()), "GET", "/rh/point/summary?month=09-2026")).status).toBe(400);
  });

  it("GET /rh/point/summary returns zeros for a user without point config", async () => {
    const fake = db();
    fake.pointsConfig.findUnique.mockResolvedValue(null);
    const response = await call(testApp(fake), "GET", "/rh/point/summary?month=2026-09");
    expect(response.status).toBe(200);
    expect((await json(response)).data).toEqual({
      month: "2026-09",
      user_id: TEST_USER_ID,
      total_worked_minutes: 0,
      expected_minutes: 0,
      balance_minutes: 0,
      overtime_minutes: 0,
      absence_days: 0,
      pending_adjustments: 0,
    });
  });

  it("POST /rh/point/register opens the day and blocks signed sheets", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/point/register", { permission: 1 });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({ action: "Entrada" });

    const locked = db();
    locked.timeSheets.findFirst.mockResolvedValue({ id: "sheet" });
    expect((await call(testApp(locked), "POST", "/rh/point/register")).status).toBe(409);
  });

  it("POST /rh/point/recalculate needs management and recalculates in a transaction", async () => {
    const fake = db();
    const body = { target_user_id: TEST_USER_ID, date_from: DAY, date_to: DAY };
    const response = await call(testApp(fake), "POST", "/rh/point/recalculate", { body });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toEqual([
      {
        point_id: POINT_ID,
        total_worked_minutes: 480,
        expected_minutes: 480,
        day_balance_minutes: 0,
      },
    ]);
    expect(fake.$transaction).toHaveBeenCalled();
    expect(
      (await call(testApp(db()), "POST", "/rh/point/recalculate", { body, permission: 2 })).status,
    ).toBe(403);
  });

  it("POST /rh/point/:pointId/calculate validates the id and organization", async () => {
    const response = await call(testApp(db()), "POST", `/rh/point/${POINT_ID}/calculate`);
    expect(response.status).toBe(200);
    expect((await call(testApp(db()), "POST", "/rh/point/not-a-uuid/calculate")).status).toBe(400);

    const foreign = db();
    foreign.point.findUnique.mockResolvedValue(point({ organization_id: "other-org" }));
    expect((await call(testApp(foreign), "POST", `/rh/point/${POINT_ID}/calculate`)).status).toBe(
      403,
    );
  });

  it("GET /rh/point/adjustment/requests scopes self-service to the actor", async () => {
    const fake = db();
    const response = await call(
      testApp(fake),
      "GET",
      `/rh/point/adjustment/requests?status=Pendente&user_id=${OTHER_USER_ID}`,
      { permission: 1 },
    );
    expect(response.status).toBe(200);
    const args = fake.timeClockRequest.findMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown> },
    ];
    expect(args[0].where).toMatchObject({ status: "Pendente", user_id: TEST_USER_ID });
    expect(
      (await call(testApp(db()), "GET", "/rh/point/adjustment/requests?status=Outro")).status,
    ).toBe(400);
  });

  it("POST /rh/point/adjustment/request creates a pending request with 201", async () => {
    const fake = db();
    const body = { ...times, justification: "Esqueci de bater" };
    const response = await call(testApp(fake), "POST", "/rh/point/adjustment/request", {
      body,
      permission: 1,
    });
    expect(response.status).toBe(201);
    expect(fake.timeClockRequest.create).toHaveBeenCalled();

    const duplicate = db();
    duplicate.timeClockRequest.findFirst.mockResolvedValue({ id: REQUEST_ID });
    expect(
      (await call(testApp(duplicate), "POST", "/rh/point/adjustment/request", { body })).status,
    ).toBe(409);
  });

  it("PUT /rh/point/adjustment/approve approves and recalculates the day", async () => {
    const fake = db();
    fake.timeClockRequest.findUnique
      .mockResolvedValueOnce(adjustment())
      .mockResolvedValueOnce(adjustment({ status: "Aprovado" }));
    fake.point.create.mockResolvedValue(point());
    const response = await call(testApp(fake), "PUT", "/rh/point/adjustment/approve", {
      body: { request_id: REQUEST_ID, obs_approver: "ok" },
    });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({ status: "Aprovado" });
    expect(
      (
        await call(testApp(db()), "PUT", "/rh/point/adjustment/approve", {
          body: { request_id: REQUEST_ID },
          permission: 1,
        })
      ).status,
    ).toBe(403);
  });

  it("PUT /rh/point/adjustment/reject rejects and refuses the requester's own request", async () => {
    const fake = db();
    fake.timeClockRequest.findUnique
      .mockResolvedValueOnce(adjustment())
      .mockResolvedValueOnce(adjustment({ status: "Rejeitado" }));
    const response = await call(testApp(fake), "PUT", "/rh/point/adjustment/reject", {
      body: { request_id: REQUEST_ID },
    });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toMatchObject({ status: "Rejeitado" });

    const own = db();
    own.timeClockRequest.findUnique.mockResolvedValue(adjustment({ user_id: TEST_USER_ID }));
    expect(
      (
        await call(testApp(own), "PUT", "/rh/point/adjustment/reject", {
          body: { request_id: REQUEST_ID },
        })
      ).status,
    ).toBe(403);
  });

  it("PUT /rh/point/adjustment/approve-bulk refuses repeated ids", async () => {
    const fake = db();
    fake.timeClockRequest.findUnique
      .mockResolvedValueOnce(adjustment())
      .mockResolvedValueOnce(adjustment({ status: "Aprovado" }));
    fake.point.create.mockResolvedValue(point());
    const response = await call(testApp(fake), "PUT", "/rh/point/adjustment/approve-bulk", {
      body: { request_ids: [REQUEST_ID] },
    });
    expect(response.status).toBe(200);
    expect((await json(response)).data).toHaveLength(1);
    expect(
      (
        await call(testApp(db()), "PUT", "/rh/point/adjustment/approve-bulk", {
          body: { request_ids: [REQUEST_ID, REQUEST_ID] },
        })
      ).status,
    ).toBe(400);
  });

  it("POST /rh/point/adjustment/retroactive creates an approved entry with 201", async () => {
    const fake = db();
    const body = { target_user_id: OTHER_USER_ID, date: DAY, ...times, justification: "RH" };
    const response = await call(testApp(fake), "POST", "/rh/point/adjustment/retroactive", {
      body,
    });
    expect(response.status).toBe(201);
    expect(fake.timeClockRequest.create).toHaveBeenCalled();
    expect(
      (
        await call(testApp(db()), "POST", "/rh/point/adjustment/retroactive", {
          body,
          permission: 2,
        })
      ).status,
    ).toBe(403);
  });

  it("POST /rh/point/adjustment/:requestId/attachment needs a file and configured storage", async () => {
    const png = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
      "comprovante.png",
      { type: "image/png" },
    );
    const withFile = new FormData();
    withFile.set("file", png);
    const path = `/rh/point/adjustment/${REQUEST_ID}/attachment`;
    const own = db();
    own.timeClockRequest.findUnique.mockResolvedValue(adjustment({ user_id: TEST_USER_ID }));

    expect((await call(testApp(own), "POST", path, { body: withFile, permission: 1 })).status).toBe(
      503,
    );
    expect((await call(testApp(own), "POST", path, { body: new FormData() })).status).toBe(400);
  });

  it("SupabaseRhPointAdjustmentStorage uploads to the Node path and signs URLs", async () => {
    const storage = {
      getBucket: vi.fn(),
      upload: vi.fn(async () => undefined),
      download: vi.fn(),
      remove: vi.fn(),
      createSignedUrl: vi.fn(async () => "https://storage.test/signed"),
    };
    const adapter = new SupabaseRhPointAdjustmentStorage(storage, "bucket", () => FILE_ID);
    const objectPath = await adapter.upload({
      organizationId: TEST_ORGANIZATION_ID,
      requestId: REQUEST_ID,
      file: { buffer: Buffer.from("x"), mimetype: "image/png" },
    });
    expect(objectPath).toBe(
      `rh/organizations/${TEST_ORGANIZATION_ID}/point-adjustments/${REQUEST_ID}/${FILE_ID}.png`,
    );
    expect(await adapter.createSignedAccessUrl(objectPath)).toBe("https://storage.test/signed");
    expect(storage.createSignedUrl).toHaveBeenCalledWith("bucket", objectPath, 300);

    storage.upload.mockRejectedValueOnce(new Error("boom"));
    await expect(
      adapter.upload({
        organizationId: TEST_ORGANIZATION_ID,
        requestId: REQUEST_ID,
        file: { buffer: Buffer.from("x"), mimetype: "image/png" },
      }),
    ).rejects.toMatchObject({ statusCode: 500 });
    await expect(
      new UnavailableRhPointAdjustmentStorage().createSignedAccessUrl(),
    ).rejects.toMatchObject({ statusCode: 503 });
  });
});
