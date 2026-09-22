import { describe, expect, expectTypeOf, it } from "vitest";
import { createSupabaseStorageClient, type SupabaseStorageClient } from "./index.js";

const environment = {
  SUPABASE_URL: "https://project.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
};

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const makeFetch = (responses: Response[]): { calls: FetchCall[]; fetch: typeof fetch } => {
  const calls: FetchCall[] = [];
  let responseIndex = 0;

  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ input, init });
      const response = responses[responseIndex];
      responseIndex += 1;
      if (!response) throw new Error("unexpected fetch call");
      return response;
    },
  };
};

const getRequest = (call: FetchCall) => new Request(call.input, call.init);

describe("Supabase Storage REST adapter", () => {
  it("exports the client contract", () => {
    expectTypeOf<SupabaseStorageClient>().toMatchTypeOf<{
      upload: SupabaseStorageClient["upload"];
      download: SupabaseStorageClient["download"];
      remove: SupabaseStorageClient["remove"];
      createSignedUrl: SupabaseStorageClient["createSignedUrl"];
    }>();
  });

  it("uploads with encoded bucket/path, auth headers, content type and upsert", async () => {
    const fake = makeFetch([new Response(null, { status: 200 })]);
    const client = createSupabaseStorageClient(environment, fake.fetch);

    await client.upload("private bucket", "folder/file name.txt", "file-body", {
      contentType: "text/plain",
      upsert: true,
    });

    const request = getRequest(fake.calls[0]);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://project.supabase.co/storage/v1/object/private%20bucket/folder/file%20name.txt",
    );
    expect(request.headers.get("apikey")).toBe(environment.SUPABASE_SERVICE_ROLE_KEY);
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
    );
    expect(request.headers.get("content-type")).toBe("text/plain");
    expect(request.headers.get("x-upsert")).toBe("true");
    await expect(request.text()).resolves.toBe("file-body");
  });

  it("downloads and returns the storage response", async () => {
    const response = new Response("file-body", { status: 200 });
    const fake = makeFetch([response]);
    const client = createSupabaseStorageClient(environment, fake.fetch);

    const downloaded = await client.download("private", "folder/file.txt");

    expect(downloaded).toBe(response);
    const request = getRequest(fake.calls[0]);
    expect(request.method).toBe("GET");
    expect(request.url).toBe(
      "https://project.supabase.co/storage/v1/object/private/folder/file.txt",
    );
    expect(request.headers.get("apikey")).toBe(environment.SUPABASE_SERVICE_ROLE_KEY);
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
    );
  });

  it("removes one object through the bucket endpoint with the path in the body", async () => {
    const fake = makeFetch([new Response(null, { status: 200 })]);
    const client = createSupabaseStorageClient(environment, fake.fetch);

    await client.remove("private", "folder/file name.txt");

    const request = getRequest(fake.calls[0]);
    expect(request.method).toBe("DELETE");
    expect(request.url).toBe("https://project.supabase.co/storage/v1/object/private");
    expect(request.headers.get("apikey")).toBe(environment.SUPABASE_SERVICE_ROLE_KEY);
    expect(request.headers.get("authorization")).toBe(
      `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
    );
    expect(request.headers.get("content-type")).toBe("application/json");
    await expect(request.json()).resolves.toEqual({ prefixes: ["folder/file name.txt"] });
  });

  it("resolves a relative signed URL and preserves an absolute signed URL", async () => {
    const relative = makeFetch([
      Response.json({ signedURL: "/storage/v1/object/sign/private/folder/file.txt?token=1" }),
    ]);
    const relativeClient = createSupabaseStorageClient(environment, relative.fetch);

    await expect(relativeClient.createSignedUrl("private", "folder/file.txt", 300)).resolves.toBe(
      "https://project.supabase.co/storage/v1/object/sign/private/folder/file.txt?token=1",
    );

    const absolute = makeFetch([
      Response.json({ signedURL: "https://cdn.example/signed/file.txt?token=2" }),
    ]);
    const absoluteClient = createSupabaseStorageClient(environment, absolute.fetch);

    await expect(absoluteClient.createSignedUrl("private", "file.txt", 600)).resolves.toBe(
      "https://cdn.example/signed/file.txt?token=2",
    );

    const request = getRequest(relative.calls[0]);
    expect(request.method).toBe("POST");
    expect(request.url).toBe(
      "https://project.supabase.co/storage/v1/object/sign/private/folder/file.txt",
    );
    expect(request.headers.get("content-type")).toContain("application/json");
    await expect(request.json()).resolves.toEqual({ expiresIn: 300 });
  });

  it("does not expose response bodies or keys when a storage request fails", async () => {
    const secretBody = "database-password-and-service-role-key";
    const fake = makeFetch([new Response(secretBody, { status: 500 })]);
    const client = createSupabaseStorageClient(environment, fake.fetch);

    const error = await client.download("private", "file.txt").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("500");
    expect((error as Error).message).not.toContain(secretBody);
    expect((error as Error).message).not.toContain(environment.SUPABASE_SERVICE_ROLE_KEY);
  });
});
