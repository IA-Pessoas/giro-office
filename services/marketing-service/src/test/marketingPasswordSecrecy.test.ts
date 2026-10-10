import "./envBootstrap.js";

import { Writable } from "node:stream";
import { inspect } from "node:util";

import {
  FORWARDED_AUTH_ORGANIZATION_ID_HEADER,
  FORWARDED_AUTH_PERMISSION_HEADER,
  FORWARDED_AUTH_USER_ID_HEADER,
  INTERNAL_SERVICE_TOKEN_HEADER,
  ServiceError,
} from "@workspace/shared";
import { createLogger } from "@workspace/shared/logger";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createMarketingApp } from "../app.js";
import { getMarketingServiceEnv } from "../config/env.js";
import { AUDIT_UNAVAILABLE_MESSAGE, type MarketingAuditEntry } from "../integrations/audit.js";

// Captura o logger de módulo usado pelas rotas (`error as logError`).
const moduleLogs = vi.hoisted(() => [] as unknown[]);
vi.mock("@workspace/shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/shared")>();
  const capture =
    (level: string) =>
    (...args: unknown[]) =>
      moduleLogs.push([level, ...args]);
  return { ...original, error: capture("error"), warn: capture("warn"), info: capture("info") };
});

const FIRST_SECRET = "Pr1meiro-Segredo!";
const SECOND_SECRET = "Segund0-Segredo?";
const organizationId = "10000000-0000-4000-8000-000000000001";
const actorUserId = "20000000-0000-4000-8000-000000000001";

function headers(): Record<string, string> {
  return {
    [INTERNAL_SERVICE_TOKEN_HEADER]: "marketing-service-internal-token-test",
    [FORWARDED_AUTH_USER_ID_HEADER]: actorUserId,
    [FORWARDED_AUTH_ORGANIZATION_ID_HEADER]: organizationId,
    [FORWARDED_AUTH_PERMISSION_HEADER]: "2",
  };
}

/** Uma tabela `passwordMkt` em memória, escopada por organização como o Prisma real. */
function createPrisma() {
  const rows = new Map<string, Record<string, unknown>>();
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "not" in value
        ? row[key] !== (value as { not: unknown }).not
        : row[key] === value,
    );
  const passwordMkt = {
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) =>
        [...rows.values()].find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      [...rows.values()].filter((row) => matches(row, where)),
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: "30000000-0000-4000-8000-000000000001", ...data };
      rows.set(row.id, row);
      return row;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...rows.get(where.id), ...data };
        rows.set(where.id, row);
        return row;
      },
    ),
  };
  const prisma = {
    passwordMkt,
    $transaction: vi.fn((run: (tx: unknown) => unknown) => run(prisma)),
  };
  return prisma;
}

function setup(audit: (entry: MarketingAuditEntry) => Promise<void>) {
  const logLines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      logLines.push(String(chunk));
      callback();
    },
  });
  const app = createMarketingApp({
    env: getMarketingServiceEnv(),
    logger: createLogger({ service: "test", env: "test", level: "trace", destination }),
    prisma: createPrisma() as never,
    audit,
  });
  return { app, logLines };
}

function expectNoSecret(label: string, value: unknown) {
  const text = typeof value === "string" ? value : inspect(value, { depth: 10 });
  expect(text, label).not.toContain(FIRST_SECRET);
  expect(text, label).not.toContain(SECOND_SECRET);
}

describe("Marketing credential secrecy", () => {
  it("audits create, update, reveal and export without the secret in trail, logs or metadata", async () => {
    moduleLogs.length = 0;
    const entries: MarketingAuditEntry[] = [];
    const { app, logLines } = setup(async (entry) => {
      entries.push(entry);
    });

    const created = await request(app)
      .post("/marketing/passwords")
      .set(headers())
      .send({ local: "Instagram", user: "acme@example.com", password: FIRST_SECRET });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const rejected = await request(app)
      .patch(`/marketing/passwords/${id}`)
      .set(headers())
      .send({ password: SECOND_SECRET, notes: `senha: ${SECOND_SECRET}` });
    expect(rejected.status).toBe(400);

    const updated = await request(app)
      .patch(`/marketing/passwords/${id}`)
      .set(headers())
      .send({ password: SECOND_SECRET, notes: "Conta oficial" });
    expect(updated.status).toBe(200);

    const listed = await request(app).get("/marketing/passwords/list").set(headers());
    const detail = await request(app).get(`/marketing/passwords/${id}`).set(headers());

    const revealed = await request(app)
      .post(`/marketing/passwords/${id}/reveal`)
      .set(headers())
      .send({ confirmed: true });
    expect(revealed.body.data.password).toBe(SECOND_SECRET);
    const exported = await request(app)
      .post(`/marketing/passwords/${id}/export`)
      .set(headers())
      .send({ confirmed: true });
    expect(exported.body.data.password).toBe(SECOND_SECRET);

    for (const [label, response] of Object.entries({
      created,
      rejected,
      updated,
      listed,
      detail,
    })) {
      expectNoSecret(`resposta ${label}`, response.text);
    }
    expectNoSecret("auditoria", entries);
    expectNoSecret("logs do app", logLines.join("\n"));
    expectNoSecret("logs de módulo", moduleLogs);
    // A recusa (observação com a senha) passa pelo logError: a captura não está vazia.
    expect(moduleLogs.length).toBeGreaterThan(0);
    expect(logLines.length).toBeGreaterThan(0);

    expect(entries.map(({ action }) => action)).toEqual([
      "Cadastro",
      "Edição",
      "Revelação",
      "Exportação",
    ]);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        organizationId,
        userId: actorUserId,
        referring: "marketing.passwords",
        referringId: id,
      });
    }
    expect(entries[1].changes).toEqual({
      notes: { from: null, to: "Conta oficial" },
      password: { from: "[protegida]", to: "[alterada]" },
    });
  });

  it("does not hand out the secret when the access cannot be audited", async () => {
    moduleLogs.length = 0;
    let failAccess = false;
    const { app, logLines } = setup(async (entry) => {
      if (failAccess && entry.action === "Revelação") {
        throw new ServiceError(503, AUDIT_UNAVAILABLE_MESSAGE, undefined, undefined, {
          expose: true,
        });
      }
    });
    const created = await request(app)
      .post("/marketing/passwords")
      .set(headers())
      .send({ local: "Site", user: "admin", password: FIRST_SECRET });

    failAccess = true;
    const revealed = await request(app)
      .post(`/marketing/passwords/${created.body.data.id}/reveal`)
      .set(headers())
      .send({ confirmed: true });

    expect(revealed.status).toBe(503);
    expectNoSecret("resposta sem trilha", revealed.text);
    expectNoSecret("logs do app", logLines.join("\n"));
    expectNoSecret("logs de módulo", moduleLogs);
  });
});
