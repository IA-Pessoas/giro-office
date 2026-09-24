import { describe, expect, it, vi } from "vitest";
import { call, TEST_ORGANIZATION_ID, TEST_USER_ID, testApp } from "./testing.js";

const SHEET_ID = "e0000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "b0000000-0000-4000-8000-000000000009";

function sheet(overrides: Record<string, unknown> = {}) {
  return {
    id: SHEET_ID,
    user_id: TEST_USER_ID,
    start_time: new Date("2026-08-01T03:00:00.000Z"),
    end_time: new Date("2026-08-02T03:00:00.000Z"),
    signature: null,
    status: "Gerada",
    reopen_reason: null,
    reopened_at: null,
    reopened_by_user_id: null,
    days: [],
    totals: null,
    organization_id: TEST_ORGANIZATION_ID,
    ...overrides,
  };
}

function db(current = sheet()) {
  const fake = {
    $queryRaw: vi.fn(async () => [{ timezone: "America/Sao_Paulo" }]),
    timeSheets: {
      findFirst: vi.fn(async (args: { select: Record<string, unknown> }) =>
        "days" in args.select ? current : null,
      ),
      findMany: vi.fn(async () => [current]),
      create: vi.fn(async () => current),
      update: vi.fn(async () => current),
    },
    pointsConfig: {
      findUnique: vi.fn(async () => ({
        user_id: TEST_USER_ID,
        organization_id: TEST_ORGANIZATION_ID,
        start_time: new Date("1970-01-01T08:00:00.000Z"),
        lunch_break: new Date("1970-01-01T12:00:00.000Z"),
        lunch_return: new Date("1970-01-01T13:00:00.000Z"),
        end_time: new Date("1970-01-01T17:00:00.000Z"),
        work_days: "1,2,3,4,5",
        bank_balance: 30,
        signature: "Assinatura",
      })),
      update: vi.fn(async () => ({})),
    },
    point: { findMany: vi.fn(async () => []) },
    holidays: { findMany: vi.fn(async () => []) },
    timeClockRequest: { findFirst: vi.fn(async () => null) },
    timeBankReleases: {
      findMany: vi.fn(async () => [{ id: "r1", minutes: 15 }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { findFirst: vi.fn(async () => ({ name: "Ana", full_name: "Ana Souza" })) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(fake)),
  };
  return fake;
}

describe("/rh/timesheets", () => {
  it("POST creates a sheet snapshot for managers", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/timesheets", {
      body: { user_id: TEST_USER_ID },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id: SHEET_ID } });
    expect(fake.timeSheets.create).toHaveBeenCalledOnce();
  });

  it("POST requires RH management", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/timesheets", {
      permission: 1,
      body: { user_id: TEST_USER_ID },
    });
    expect(response.status).toBe(403);
    expect(fake.timeSheets.create).not.toHaveBeenCalled();
  });

  it("PUT /rebuild rebuilds an open sheet and refuses a signed one", async () => {
    const ok = await call(testApp(db()), "PUT", "/rh/timesheets/rebuild", {
      body: { id: SHEET_ID },
    });
    expect(ok.status).toBe(200);
    const signed = await call(
      testApp(db(sheet({ status: "Assinada" }))),
      "PUT",
      "/rh/timesheets/rebuild",
      {
        body: { id: SHEET_ID },
      },
    );
    expect(signed.status).toBe(409);
  });

  it("GET lists only the requester's sheets for self-service users", async () => {
    const fake = db();
    const response = await call(
      testApp(fake),
      "GET",
      `/rh/timesheets?target_user_id=${OTHER_USER_ID}`,
      { permission: 1 },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ id: SHEET_ID, has_details: false, worked_minutes: 0 }],
    });
    expect(fake.timeSheets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: TEST_ORGANIZATION_ID, user_id: TEST_USER_ID },
      }),
    );
  });

  it("GET without RH permission returns 403", async () => {
    const response = await call(testApp(db()), "GET", "/rh/timesheets", { permission: 0 });
    expect(response.status).toBe(403);
  });

  it("GET /:id returns the detail and blocks third-party sheets for self-service", async () => {
    const own = await call(testApp(db()), "GET", `/rh/timesheets/${SHEET_ID}`, { permission: 1 });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ data: { id: SHEET_ID, days: [] } });
    const other = await call(
      testApp(db(sheet({ user_id: OTHER_USER_ID }))),
      "GET",
      `/rh/timesheets/${SHEET_ID}`,
      { permission: 1 },
    );
    expect(other.status).toBe(403);
  });

  it("GET /:id/pdf streams a PDF attachment", async () => {
    const response = await call(testApp(db()), "GET", `/rh/timesheets/${SHEET_ID}/pdf`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="folha-ponto-${SHEET_ID}.pdf"`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("%PDF");
  });

  it("GET /:id/pdf embeds a PNG signature image", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const response = await call(
      testApp(db(sheet({ signature: png, status: "Assinada" }))),
      "GET",
      `/rh/timesheets/${SHEET_ID}/pdf`,
    );
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()))).toContain(
      "/Subtype /Image",
    );
  });

  it("GET /:id/pdf rejects an invalid id with 400", async () => {
    const response = await call(testApp(db()), "GET", "/rh/timesheets/nope/pdf");
    expect(response.status).toBe(400);
  });

  it("PUT /reopen reopens a signed sheet and requires management", async () => {
    const fake = db(sheet({ signature: "x", status: "Assinada" }));
    const ok = await call(testApp(fake), "PUT", "/rh/timesheets/reopen", {
      body: { id: SHEET_ID, reason: "Ajuste" },
    });
    expect(ok.status).toBe(200);
    const denied = await call(testApp(db()), "PUT", "/rh/timesheets/reopen", {
      permission: 1,
      body: { id: SHEET_ID, reason: "Ajuste" },
    });
    expect(denied.status).toBe(403);
  });

  it("PUT /sign signs in a transaction releasing pending bank minutes", async () => {
    const fake = db();
    const response = await call(testApp(fake), "PUT", "/rh/timesheets/sign", {
      permission: 1,
      body: { id: SHEET_ID },
    });
    expect(response.status).toBe(200);
    expect(fake.$transaction).toHaveBeenCalledOnce();
    expect(fake.pointsConfig.update).toHaveBeenCalledWith({
      where: { user_id: TEST_USER_ID },
      data: { bank_balance: { increment: 15 } },
    });
  });

  it("PUT /sign refuses another collaborator's sheet", async () => {
    const response = await call(
      testApp(db(sheet({ user_id: OTHER_USER_ID }))),
      "PUT",
      "/rh/timesheets/sign",
      { body: { id: SHEET_ID } },
    );
    expect(response.status).toBe(403);
  });
});
