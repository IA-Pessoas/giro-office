import "./envBootstrap.js";

import {
  createLogger,
  FORWARDED_AUTH_MODULES_HEADER,
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
} from "@workspace/shared";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTriagemApp } from "../app.js";
import { getTriagemServiceEnv } from "../config/env.js";
import type { TriagemPrismaClient } from "../integrations/prisma.js";
import type { TriageSolicitationRouteDeps } from "../routes/triageSolicitation.routes.js";

const ORGANIZATION_ID = "a0000000-0000-4000-8000-000000000001";
const USER_ID = "c0000000-0000-4000-8000-000000000001";
const CLIENT_ID = "b0000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "e0000000-0000-4000-8000-000000000001";
const SOLICITATION_ID = "d0000000-0000-4000-8000-000000000001";

const env = getTriagemServiceEnv();
const logger = createLogger({ service: "triagem-service", env: env.nodeEnv, level: "silent" });

const authHeaders = {
  [INTERNAL_SERVICE_TOKEN_HEADER]: "test-audit-token",
  [FORWARDED_AUTH_USER_ID_HEADER]: USER_ID,
  [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: ORGANIZATION_ID,
  [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
  [FORWARDED_AUTH_MODULES_HEADER]: JSON.stringify({ triagem: 2 }),
};

function setup() {
  const deps = {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ id: SOLICITATION_ID })),
    create: vi.fn(async () => ({ id: SOLICITATION_ID })),
    close: vi.fn(async () => ({ id: SOLICITATION_ID, status: "CLOSED" })),
    getNoteCounts: vi.fn(async () => ({ xml_inbound: 0 })),
    updateNoteCounts: vi.fn(async () => ({ xml_inbound: 3 })),
    indicators: vi.fn(async () => ({ totals: { solicitations: 0, clients: 0, notes: 0 } })),
  } as unknown as TriageSolicitationRouteDeps;
  const app = createTriagemApp({
    env,
    logger,
    prisma: { $queryRaw: vi.fn() } as unknown as TriagemPrismaClient,
    triageSolicitationRouteDeps: deps,
  });
  return { app, deps };
}

describe("rotas de solicitações da Triagem", () => {
  it("cria com corpo validado e contexto encaminhado", async () => {
    const { app, deps } = setup();
    const body = {
      client_id: CLIENT_ID,
      competence: "2026-09",
      category_id: CATEGORY_ID,
      description: "Conferir notas.",
      responsible_id: USER_ID,
    };

    const response = await request(app).post("/triagem/solicitations").set(authHeaders).send(body);

    expect(response.status).toBe(201);
    expect(deps.create).toHaveBeenCalledWith(
      body,
      expect.objectContaining({ userId: USER_ID, organizationId: ORGANIZATION_ID }),
    );
  });

  it("recusa criação sem categoria", async () => {
    const { app, deps } = setup();

    const response = await request(app).post("/triagem/solicitations").set(authHeaders).send({
      client_id: CLIENT_ID,
      competence: "2026-09",
      description: "x",
      responsible_id: USER_ID,
    });

    expect(response.status).toBe(400);
    expect(deps.create).not.toHaveBeenCalled();
  });

  it("lista por situação e fecha por ID", async () => {
    const { app, deps } = setup();

    const list = await request(app).get("/triagem/solicitations?status=CLOSED").set(authHeaders);
    const close = await request(app)
      .patch(`/triagem/solicitations/${SOLICITATION_ID}/close`)
      .set(authHeaders);
    const detail = await request(app)
      .get(`/triagem/solicitations/${SOLICITATION_ID}`)
      .set(authHeaders);

    expect([list.status, close.status, detail.status]).toEqual([200, 200, 200]);
    expect(deps.list).toHaveBeenCalledWith(
      { status: "CLOSED", clientId: undefined, competence: undefined },
      expect.objectContaining({ userId: USER_ID }),
    );
    expect(deps.close).toHaveBeenCalledWith(SOLICITATION_ID, expect.anything());
    expect(deps.get).toHaveBeenCalledWith(SOLICITATION_ID, expect.anything());
  });

  it("indicadores exigem competência e não caem na rota de detalhe", async () => {
    const { app, deps } = setup();

    const ok = await request(app)
      .get("/triagem/solicitations/indicators?competence=2026-09&status=OPEN")
      .set(authHeaders);
    const missing = await request(app).get("/triagem/solicitations/indicators").set(authHeaders);

    expect([ok.status, missing.status]).toEqual([200, 400]);
    expect(deps.indicators).toHaveBeenCalledWith(
      { competence: "2026-09", status: "OPEN" },
      expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    );
    expect(deps.get).not.toHaveBeenCalled();
  });

  it("lê e grava contadores de notas pelo ID do pedido", async () => {
    const { app, deps } = setup();
    const counts = { xml_inbound: 3, xml_outbound: 5, nfse_issued: 2, nfse_received: 1 };
    const path = `/triagem/solicitations/${SOLICITATION_ID}/note-counts`;

    const read = await request(app).get(path).set(authHeaders);
    const saved = await request(app).put(path).set(authHeaders).send(counts);
    const negative = await request(app)
      .put(path)
      .set(authHeaders)
      .send({ ...counts, nfse_received: -1 });

    expect([read.status, saved.status, negative.status]).toEqual([200, 200, 400]);
    expect(deps.getNoteCounts).toHaveBeenCalledWith(SOLICITATION_ID, expect.anything());
    expect(deps.updateNoteCounts).toHaveBeenCalledTimes(1);
    expect(deps.updateNoteCounts).toHaveBeenCalledWith(SOLICITATION_ID, counts, expect.anything());
  });
});
