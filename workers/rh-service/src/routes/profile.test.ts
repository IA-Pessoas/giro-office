import { describe, expect, it, vi } from "vitest";
import { call, TEST_ORGANIZATION_ID, TEST_USER_ID, testApp } from "./testing.js";

const OTHER_USER_ID = "b0000000-0000-4000-8000-000000000002";
const CONTACT_ID = "f0000000-0000-4000-8000-000000000001";
const DEPARTMENT_ID = "d0000000-0000-4000-8000-000000000001";

function userRow(id: string, departmentId = DEPARTMENT_ID) {
  return {
    version: 1,
    id,
    name: "Ana",
    full_name: "Ana Souza",
    gender: null,
    birth_date: null,
    cpf: null,
    rg: null,
    address: null,
    job_title: "Analista",
    email: null,
    phone: null,
    hire_date: null,
    dominio_hire_date: null,
    termination_date: null,
    photo_url: null,
    status: "active",
    department_id: departmentId,
    allergies: [{ name: "Pólen", fonts: "Ar", action: "Antialérgico" }],
    emergency_contacts: [{ id: CONTACT_ID, name: "Bia", phone: "11999999999" }],
    department: { id: departmentId, name: "Fiscal" },
  };
}

function db() {
  return {
    user: {
      findFirst: vi.fn(async (args: { where: { AND: [{ id: string }] } }) =>
        userRow(args.where.AND[0].id),
      ),
      findMany: vi.fn(async () => [userRow(TEST_USER_ID)]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    department: { findFirst: vi.fn(async () => ({ id: DEPARTMENT_ID })) },
  };
}

describe("/rh/profile/colaborator", () => {
  it("returns the caller's own dossier", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/profile/colaborator", {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      data: { id: TEST_USER_ID, full_name: "Ana Souza", emergency_contacts: [{ id: CONTACT_ID }] },
    });
    const where = fake.user.findFirst.mock.calls[0][0].where as unknown as {
      AND: [unknown, { OR: [{ organization_id: string }] }];
    };
    expect(where.AND[1].OR[0]).toEqual({ organization_id: TEST_ORGANIZATION_ID });
  });

  it("hides other users' dossiers from self-service", async () => {
    const response = await call(
      testApp(db()),
      "GET",
      `/rh/profile/colaborator?user_id=${OTHER_USER_ID}`,
      { permission: 1 },
    );
    expect(response.status).toBe(404);
  });

  it("rejects without RH permission", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", "/rh/profile/colaborator", {
      permission: 0,
    });
    expect(response.status).toBe(403);
    expect(fake.user.findFirst).not.toHaveBeenCalled();
  });

  it("lists dossiers filtered by department for RH management", async () => {
    const fake = db();
    const response = await call(
      testApp(fake),
      "GET",
      `/rh/profile/colaborator/list?department_id=${DEPARTMENT_ID}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: TEST_USER_ID }] });
    expect(fake.user.findMany.mock.calls[0]).toEqual([
      expect.objectContaining({
        where: expect.objectContaining({ AND: [{ department_id: DEPARTMENT_ID }] }),
      }),
    ]);
  });

  it("rejects unknown list query parameters", async () => {
    const response = await call(testApp(db()), "GET", "/rh/profile/colaborator/list?x=1");
    expect(response.status).toBe(400);
  });

  it("updates the caller's own allowed fields with optimistic locking", async () => {
    const fake = db();
    const response = await call(testApp(fake), "PUT", "/rh/profile/colaborator", {
      permission: 1,
      body: { phone: "11888888888" },
    });
    expect(response.status).toBe(200);
    expect(fake.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { phone: "11888888888", version: { increment: 1 } },
      }),
    );
  });

  it("rejects fields self-service cannot change", async () => {
    const response = await call(testApp(db()), "PUT", "/rh/profile/colaborator", {
      permission: 1,
      body: { job_title: "Diretora" },
    });
    expect(response.status).toBe(400);
  });
});

describe("/rh/profile/contact", () => {
  it("lists emergency contacts", async () => {
    const response = await call(testApp(db()), "GET", "/rh/profile/contact", { permission: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: CONTACT_ID, name: "Bia" }] });
  });

  it("hides another user's contacts from a department manager", async () => {
    const response = await call(
      testApp(db()),
      "GET",
      `/rh/profile/contact?user_id=${OTHER_USER_ID}`,
      { permission: 2 },
    );
    expect(response.status).toBe(404);
  });

  it("creates a contact", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/profile/contact", {
      permission: 1,
      body: { name: "Caio", phone: "11777777777" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { name: "Caio", phone: "11777777777" } });
    expect(fake.user.updateMany).toHaveBeenCalled();
  });

  it("validates contact creation", async () => {
    const response = await call(testApp(db()), "POST", "/rh/profile/contact", {
      permission: 1,
      body: { name: "Caio" },
    });
    expect(response.status).toBe(400);
  });

  it("updates a contact", async () => {
    const response = await call(testApp(db()), "PUT", "/rh/profile/contact", {
      permission: 1,
      body: { id: CONTACT_ID, name: "Bianca" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: CONTACT_ID, name: "Bianca" } });
  });

  it("returns 404 when updating an unknown contact", async () => {
    const response = await call(testApp(db()), "PUT", "/rh/profile/contact", {
      permission: 1,
      body: { id: OTHER_USER_ID, name: "Bianca" },
    });
    expect(response.status).toBe(404);
  });

  it("deletes a contact", async () => {
    const response = await call(testApp(db()), "DELETE", "/rh/profile/contact", {
      permission: 1,
      body: { id: CONTACT_ID },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: CONTACT_ID } });
  });

  it("returns 409 when the dossier changed concurrently", async () => {
    const fake = db();
    fake.user.updateMany.mockResolvedValue({ count: 0 });
    const response = await call(testApp(fake), "DELETE", "/rh/profile/contact", {
      permission: 1,
      body: { id: CONTACT_ID },
    });
    expect(response.status).toBe(409);
  });
});

describe("/rh/profile/allergy", () => {
  it("lists allergies", async () => {
    const response = await call(testApp(db()), "GET", "/rh/profile/allergy", { permission: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ name: "Pólen" }] });
  });

  it("rejects allergy listing without RH permission", async () => {
    const response = await call(testApp(db()), "GET", "/rh/profile/allergy", { permission: 0 });
    expect(response.status).toBe(403);
  });

  it("replaces allergies", async () => {
    const fake = db();
    const allergies = [{ name: "Lactose", fonts: "Leite", action: "Evitar" }];
    const response = await call(testApp(fake), "PUT", "/rh/profile/allergy", {
      permission: 1,
      body: { allergies },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: allergies });
  });

  it("validates allergy payloads", async () => {
    const response = await call(testApp(db()), "PUT", "/rh/profile/allergy", {
      permission: 1,
      body: { allergies: [{ name: "Lactose" }] },
    });
    expect(response.status).toBe(400);
  });
});
