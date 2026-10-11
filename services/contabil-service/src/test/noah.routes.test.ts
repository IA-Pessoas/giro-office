import "./envBootstrap.js";
import { createLogger } from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createContabilApp } from "../app.js";
import { getContabilServiceEnv } from "../config/env.js";
import type { NoahReceipt } from "../services/noahService.js";

const id = "a0000000-0000-4000-8000-000000000001";
const env = getContabilServiceEnv();
const headers = (permission = "2") => ({
  "x-internal-service-token": "audit-service-token",
  "x-auth-user-id": "actor",
  "x-auth-organization-id": "organization-a",
  "x-auth-permission": permission,
});
function setup() {
  const deps = {
    create: vi.fn(async () => ({ id, rejections: [] }) as unknown as NoahReceipt),
    download: vi.fn(async () => "FORNECEDOR;DATA;VALOR;ARQUIVO\r\n"),
  };
  return {
    deps,
    app: createContabilApp({ env, logger: createLogger({ service: "test" }), noahRouteDeps: deps }),
  };
}

describe("rotas Noah", () => {
  it("recebe ZIP binário autenticado e entrega CSV com download privado", async () => {
    const { app, deps } = setup();
    const bytes = Buffer.from("ZIP de teste do contrato");
    const created = await request(app)
      .post("/contabil/noah?filename=noah.zip")
      .set(headers())
      .set("content-type", "application/zip")
      .send(bytes);
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ success: true, data: { id, rejections: [] } });
    expect(deps.create).toHaveBeenCalledWith(bytes, "noah.zip", {
      userId: "actor",
      organizationId: "organization-a",
      permission: 2,
    });
    const download = await request(app).get(`/contabil/noah/${id}/csv`).set(headers("1"));
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("text/csv");
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect(download.headers["cache-control"]).toBe("no-store");
    expect(download.text).toBe("FORNECEDOR;DATA;VALOR;ARQUIVO\r\n");
  });

  it("recusa ausência de autenticação, escrita sem edição e leitura sem módulo", async () => {
    const { app, deps } = setup();
    expect((await request(app).post("/contabil/noah?filename=noah.zip")).status).toBe(401);
    expect(
      (await request(app).post("/contabil/noah?filename=noah.zip").set(headers("1"))).status,
    ).toBe(403);
    expect((await request(app).get(`/contabil/noah/${id}/csv`).set(headers("0"))).status).toBe(403);
    expect(deps.create).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("valida nome, contexto forjado, mídia, corpo e tamanho antes da conversão", async () => {
    const { app, deps } = setup();
    for (const query of ["filename=../noah.zip", "filename=noah.zip&organization_id=forged"]) {
      expect(
        (
          await request(app)
            .post(`/contabil/noah?${query}`)
            .set(headers())
            .set("content-type", "application/zip")
            .send(Buffer.from("zip"))
        ).status,
      ).toBe(400);
    }
    expect(
      (await request(app).post("/contabil/noah?filename=noah.zip").set(headers()).send({})).status,
    ).toBe(415);
    expect(
      (
        await request(app)
          .post("/contabil/noah?filename=noah.zip")
          .set(headers())
          .set("content-type", "application/zip")
          .send(Buffer.alloc(5 * 1024 * 1024 + 1))
      ).status,
    ).toBe(413);
    expect((await request(app).get("/contabil/noah/not-a-uuid/csv").set(headers())).status).toBe(
      400,
    );
    expect(deps.create).not.toHaveBeenCalled();
  });
});
