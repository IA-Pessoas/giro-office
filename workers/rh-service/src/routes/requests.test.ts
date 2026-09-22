import { createSupabaseStorageClient } from "@workspace/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRhRequestMessageObjectPath,
  SupabaseRhRequestMessageStorage,
} from "../services/rhRequestMessageStorage.js";
import { call, TEST_ORGANIZATION_ID, TEST_USER_ID, testApp, testEnv } from "./testing.js";

const REQUEST_ID = "e0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "c0000000-0000-4000-8000-000000000001";
const OTHER_USER = "b0000000-0000-4000-8000-000000000002";
const THIRD_USER = "b0000000-0000-4000-8000-000000000003";
const FILE_ID = "f0000000-0000-4000-8000-000000000001";
const OBJECT_PATH = `rh/organizations/${TEST_ORGANIZATION_ID}/request-messages/${REQUEST_ID}/${FILE_ID}.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    title: "Férias",
    description: "Pedido",
    requester_user_id: TEST_USER_ID,
    assigned_to_user_id: OTHER_USER,
    category_id: CATEGORY_ID,
    urgency: "Low",
    status: "New",
    organization_id: TEST_ORGANIZATION_ID,
    ...overrides,
  };
}

function db(request = snapshot()) {
  const fake = {
    user: { findFirst: vi.fn(async () => ({ id: OTHER_USER })) },
    rhCategory: { findFirst: vi.fn(async () => ({ id: CATEGORY_ID })) },
    rhRequest: {
      create: vi.fn(async () => request),
      findFirst: vi.fn(async () => request),
      findMany: vi.fn(async () => [request]),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({ ...request, status: "In_Progress" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    rhRequestRead: { upsert: vi.fn(async () => ({})) },
    rhNotification: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    rhMessage: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: "m1",
        ...args.data,
      })),
      findMany: vi.fn(async () => [
        { id: "m1", attachment: null },
        { id: "m2", attachment: "https://public.example/legacy.png" },
      ]),
    },
    rhMessageRead: { createMany: vi.fn(async () => ({ count: 2 })) },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(fake)),
  };
  return fake;
}

afterEach(() => vi.unstubAllGlobals());

describe("/rh/requests", () => {
  it("creates a request assigned to an eligible RH user and notifies them", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/requests", {
      permission: 1,
      body: { title: "Férias", description: "Pedido", category_id: CATEGORY_ID, urgency: "Low" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { id: REQUEST_ID } });
    expect(fake.rhRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: TEST_ORGANIZATION_ID,
          requester_user_id: TEST_USER_ID,
          assigned_to_user_id: OTHER_USER,
          status: "New",
        }),
      }),
    );
    expect(fake.rhNotification.upsert).toHaveBeenCalled();
  });

  it("rejects creation without RH permission", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/requests", {
      permission: 0,
      body: { title: "x", description: "y", category_id: CATEGORY_ID, urgency: "Low" },
    });
    expect(response.status).toBe(403);
    expect(fake.rhRequest.create).not.toHaveBeenCalled();
  });

  it("lists only requests the non-manager participates in", async () => {
    const fake = db();
    const response = await call(
      testApp(fake),
      "GET",
      `/rh/requests?page=1&limit=10&requester_user_id=${OTHER_USER}`,
      { permission: 1 },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { total: 1, page: 1, pageSize: 10, hasMore: false },
    });
    const args = (fake.rhRequest.findMany.mock.calls[0] as unknown as [{ where: unknown }])[0];
    expect(args.where).toEqual({
      organization_id: TEST_ORGANIZATION_ID,
      OR: [{ requester_user_id: TEST_USER_ID }, { assigned_to_user_id: TEST_USER_ID }],
    });
  });

  it("rejects invalid list queries", async () => {
    const response = await call(testApp(db()), "GET", "/rh/requests?limit=0", { permission: 1 });
    expect(response.status).toBe(400);
  });

  it("returns a request and marks it as opened", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", `/rh/requests/${REQUEST_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(fake.rhRequestRead.upsert).toHaveBeenCalled();
    expect(fake.rhNotification.updateMany).toHaveBeenCalled();
  });

  it("forbids a non-manager from reading a third-party request", async () => {
    const fake = db(snapshot({ requester_user_id: OTHER_USER, assigned_to_user_id: THIRD_USER }));
    const response = await call(testApp(fake), "GET", `/rh/requests/${REQUEST_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(403);
    expect(fake.rhRequestRead.upsert).not.toHaveBeenCalled();
  });

  it("updates status for managers following the workflow", async () => {
    const fake = db();
    const response = await call(testApp(fake), "PUT", "/rh/requests", {
      body: { id: REQUEST_ID, status: "In_Progress" },
    });
    expect(response.status).toBe(200);
    expect(fake.rhRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: REQUEST_ID }, data: { status: "In_Progress" } }),
    );
  });

  it("rejects updates below management permission", async () => {
    const response = await call(testApp(db()), "PUT", "/rh/requests", {
      permission: 2,
      body: { id: REQUEST_ID, status: "In_Progress" },
    });
    expect(response.status).toBe(403);
  });

  it("deletes a request in the organization", async () => {
    const fake = db();
    const response = await call(testApp(fake), "DELETE", "/rh/requests", {
      body: { id: REQUEST_ID },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { message: "Solicitação removida com sucesso" },
    });
    expect(fake.rhRequest.deleteMany).toHaveBeenCalledWith({
      where: { id: REQUEST_ID, organization_id: TEST_ORGANIZATION_ID },
    });
  });

  it("returns 404 when deleting a missing request", async () => {
    const fake = db();
    fake.rhRequest.findFirst.mockResolvedValueOnce(null as never);
    const response = await call(testApp(fake), "DELETE", "/rh/requests", {
      body: { id: REQUEST_ID },
    });
    expect(response.status).toBe(404);
  });
});

describe("/rh/messages", () => {
  it("creates a message and moves a new request to In_Progress", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/messages", {
      permission: 1,
      body: { request_id: REQUEST_ID, message: "Olá", type: "Message" },
    });
    expect(response.status).toBe(200);
    expect(fake.rhRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "In_Progress" } }),
    );
    expect(fake.rhNotification.upsert).toHaveBeenCalled();
  });

  it("forbids a viewer from sending a solution", async () => {
    const fake = db();
    const response = await call(testApp(fake), "POST", "/rh/messages", {
      permission: 1,
      body: { request_id: REQUEST_ID, message: "ok", type: "Solution" },
    });
    expect(response.status).toBe(403);
    expect(fake.rhMessage.create).not.toHaveBeenCalled();
  });

  it("returns 503 for an attachment when storage is not configured", async () => {
    const fake = db();
    const form = new FormData();
    form.set("request_id", REQUEST_ID);
    form.set("message", "anexo");
    form.set("type", "Message");
    form.set("file", new File([PNG], "a.png", { type: "image/png" }));
    const response = await call(testApp(fake), "POST", "/rh/messages", {
      permission: 1,
      body: form,
    });
    expect(response.status).toBe(503);
    expect(fake.rhMessage.create).not.toHaveBeenCalled();
  });

  it("uploads the attachment and answers with a signed URL", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/object/sign/")
        ? Response.json({ signedURL: "/storage/v1/object/sign/x?token=t" })
        : new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fake = db();
    const form = new FormData();
    form.set("request_id", REQUEST_ID);
    form.set("message", "anexo");
    form.set("type", "Message");
    form.set("file", new File([PNG], "a.png", { type: "image/png" }));
    const app = testApp(fake, {
      env: testEnv({ SUPABASE_URL: "https://sb.example", SUPABASE_SERVICE_ROLE_KEY: "k" }),
    });
    const response = await call(app, "POST", "/rh/messages", { permission: 1, body: form });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { attachment: string } };
    expect(body.data.attachment).toBe("https://sb.example/storage/v1/object/sign/x?token=t");
    const stored = (
      fake.rhMessage.create.mock.calls[0] as unknown as [{ data: { attachment: string } }]
    )[0].data.attachment;
    expect(isRhRequestMessageObjectPath(stored, TEST_ORGANIZATION_ID, REQUEST_ID)).toBe(true);
  });

  it("lists messages quarantining legacy attachments", async () => {
    const fake = db();
    const response = await call(testApp(fake), "GET", `/rh/messages?requestId=${REQUEST_ID}`, {
      permission: 1,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [
        { id: "m1", attachment: null, is_read: true },
        { id: "m2", attachment: null, is_read: true },
      ],
    });
    expect(fake.rhMessageRead.createMany).toHaveBeenCalled();
  });

  it("requires requestId when listing", async () => {
    const response = await call(testApp(db()), "GET", "/rh/messages", { permission: 1 });
    expect(response.status).toBe(400);
  });
});

describe("SupabaseRhRequestMessageStorage", () => {
  it("uploads under the organization/request prefix and signs for 300 seconds", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.includes("/object/sign/")
        ? Response.json({ signedURL: "/storage/v1/object/sign/p?token=t" })
        : new Response("{}"),
    );
    const storage = new SupabaseRhRequestMessageStorage(
      createSupabaseStorageClient(
        { SUPABASE_URL: "https://sb.example", SUPABASE_SERVICE_ROLE_KEY: "k" },
        fetchMock as unknown as typeof fetch,
      ),
      "rh-request-messages",
      () => FILE_ID,
    );
    const path = await storage.upload({
      organizationId: TEST_ORGANIZATION_ID,
      requestId: REQUEST_ID,
      file: { buffer: Buffer.from(PNG), mimetype: "image/png" },
    });
    expect(path).toBe(OBJECT_PATH);
    await storage.createSignedAccessUrl(path);
    const signInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(signInit.body))).toEqual({ expiresIn: 300 });
  });

  it("maps storage failures to 500", async () => {
    const storage = new SupabaseRhRequestMessageStorage(
      createSupabaseStorageClient(
        { SUPABASE_URL: "https://sb.example", SUPABASE_SERVICE_ROLE_KEY: "k" },
        (async () => new Response("", { status: 500 })) as unknown as typeof fetch,
      ),
      "rh-request-messages",
    );
    await expect(storage.createSignedAccessUrl(OBJECT_PATH)).rejects.toMatchObject({
      statusCode: 500,
    });
  });
});
