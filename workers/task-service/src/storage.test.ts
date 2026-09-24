import { describe, expect, it, vi } from "vitest";
import { createTaskAttachmentStorage } from "./storage.js";

function supabase(routes: Record<string, () => Response>) {
  const calls: Request[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request);
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;
    const match = Object.entries(routes).find(([route]) => key.startsWith(route));
    return match ? match[1]() : new Response("não encontrado", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const env = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  TASK_ATTACHMENT_STORAGE_BUCKET: "task-attachments-private",
};
const file = {
  buffer: Buffer.from("%PDF-1.4"),
  mimetype: "application/pdf" as const,
  originalname: "a.pdf",
};

describe("createTaskAttachmentStorage", () => {
  it("sobe no bucket privado no caminho do Node e devolve o objectPath", async () => {
    const { calls, fetchImpl } = supabase({
      "GET /storage/v1/bucket/": () => Response.json({ public: false }),
      "POST /storage/v1/object/": () => Response.json({}),
    });
    const storage = createTaskAttachmentStorage(env, {
      fetchImpl,
      createAttachmentId: () => "att-1",
    });

    const path = await storage.upload({ organizationId: "o-1", taskId: "t-1", file });

    expect(path).toBe("integracao/organizations/o-1/tasks/t-1/att-1.pdf");
    const upload = calls.find((request) => request.method === "POST");
    expect(new URL(upload?.url ?? "").pathname).toBe(
      "/storage/v1/object/task-attachments-private/integracao/organizations/o-1/tasks/t-1/att-1.pdf",
    );
    expect(upload?.headers.get("content-type")).toBe("application/pdf");
    expect(upload?.headers.get("x-upsert")).toBe("false");
  });

  it("recusa bucket público com 503, como o Node", async () => {
    const { fetchImpl } = supabase({
      "GET /storage/v1/bucket/": () => Response.json({ public: true }),
    });
    const storage = createTaskAttachmentStorage(env, { fetchImpl });

    await expect(storage.upload({ organizationId: "o", taskId: "t", file })).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("gera link assinado de 300 s", async () => {
    const { calls, fetchImpl } = supabase({
      "GET /storage/v1/bucket/": () => Response.json({ public: false }),
      "POST /storage/v1/object/sign/": () => Response.json({ signedURL: "/object/sign/x?token=1" }),
    });
    const storage = createTaskAttachmentStorage(env, { fetchImpl });

    const url = await storage.createSignedAccessUrl("integracao/x.pdf");

    expect(url).toContain("token=1");
    const sign = calls.find((request) => request.url.includes("/object/sign/"));
    expect(await sign?.json()).toEqual({ expiresIn: 300 });
  });

  it("falha com 500 do Node quando o upload é recusado", async () => {
    const { fetchImpl } = supabase({
      "GET /storage/v1/bucket/": () => Response.json({ public: false }),
      "POST /storage/v1/object/": () => new Response("x", { status: 400 }),
    });
    const storage = createTaskAttachmentStorage(env, { fetchImpl });

    await expect(storage.upload({ organizationId: "o", taskId: "t", file })).rejects.toMatchObject({
      statusCode: 500,
      message: "Erro ao armazenar anexo da tarefa.",
    });
  });

  it("usa o bucket padrão do Node quando TASK_ATTACHMENT_STORAGE_BUCKET não vem", async () => {
    const { calls, fetchImpl } = supabase({
      "GET /storage/v1/bucket/": () => Response.json({ public: false }),
      "POST /storage/v1/object/": () => Response.json({}),
    });
    const { TASK_ATTACHMENT_STORAGE_BUCKET: _bucket, ...semBucket } = env;
    const storage = createTaskAttachmentStorage(semBucket, {
      fetchImpl,
      createAttachmentId: () => "a",
    });

    await storage.upload({ organizationId: "o", taskId: "t", file });

    expect(new URL(calls[0].url).pathname).toBe("/storage/v1/bucket/task-attachments-private");
  });

  it("indisponível (503) sem configuração do Supabase", async () => {
    const storage = createTaskAttachmentStorage({});
    await expect(storage.remove("x")).rejects.toMatchObject({ statusCode: 503 });
  });
});
