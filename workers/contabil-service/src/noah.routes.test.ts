import { describe, expect, it } from "vitest";
import {
  NoahService,
  type NoahServicePrisma,
} from "../../../services/contabil-service/src/services/noahService.js";
import { noahZip } from "../../../services/contabil-service/src/test/noahFixtures.js";
import { createContabilWorkerApp } from "./app.js";

const id = "a0000000-0000-4000-8000-000000000001";
const env = { JWT_SECRET: "fixture-secret", INTERNAL_SERVICE_TOKEN: "fixture-internal" };
const headers = (permission = 2, organizationId = "organization-a") => ({
  "x-internal-service-token": env.INTERNAL_SERVICE_TOKEN,
  "x-auth-user-id": "actor",
  "x-auth-organization-id": organizationId,
  "x-auth-modules": JSON.stringify({ contabil: permission }),
  "content-type": "application/zip",
});

describe("Noah no Worker", () => {
  it("converte ZIP, preserva auditoria e isola o download por organização", async () => {
    let saved: Record<string, unknown> | undefined;
    const database = {
      noahConversion: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          saved = { ...data, id, created_at: new Date("2026-10-09T12:00:00Z") };
          return saved;
        },
        findFirst: async ({ where }: { where: { organization_id: string } }) =>
          saved?.organization_id === where.organization_id ? saved : null,
      },
    };
    const app = createContabilWorkerApp({
      env,
      noahService: new NoahService(database as unknown as NoahServicePrisma),
    });
    const result = await app.request("/contabil/noah?filename=noah.zip", {
      method: "POST",
      headers: headers(),
      body: await noahZip(),
    });
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({
      success: true,
      data: { id, row_count: 2, created_by: "actor" },
    });
    expect(saved?.source_sha256).toMatch(/^[a-f0-9]{64}$/u);
    const download = await app.request(`/contabil/noah/${id}/csv`, { headers: headers(1) });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("cache-control")).toBe("no-store");
    expect(await download.text()).toContain("Fornecedor & Cia;09/10/2026;1.234,56;");
    const denied = await app.request(`/contabil/noah/${id}/csv`, {
      headers: headers(2, "organization-b"),
    });
    expect(denied.status).toBe(404);
  });

  it("aplica autenticação, edição, validação e limite de bytes antes da persistência", async () => {
    const app = createContabilWorkerApp({ env });
    expect((await app.request("/contabil/noah", { method: "POST" })).status).toBe(401);
    expect(
      (await app.request("/contabil/noah", { method: "POST", headers: headers(1) })).status,
    ).toBe(403);
    expect((await app.request(`/contabil/noah/${id}/csv`, { headers: headers(0) })).status).toBe(
      403,
    );
    expect(
      (
        await app.request("/contabil/noah?filename=noah.zip&organization_id=forged", {
          method: "POST",
          headers: headers(),
          body: "invalid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await app.request("/contabil/noah?filename=noah.zip", {
          method: "POST",
          headers: { ...headers(), "content-type": "text/html" },
          body: "invalid",
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await app.request("/contabil/noah?filename=noah.zip", {
          method: "POST",
          headers: headers(),
          body: new Uint8Array(5 * 1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
  });
});
